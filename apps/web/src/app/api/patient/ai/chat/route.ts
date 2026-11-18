import { NextRequest, NextResponse, after } from "next/server";
import { headers } from "next/headers";
import {
  streamText,
  generateText,
  convertToModelMessages,
  type UIMessage,
} from "ai";

import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import {
  aiConversation,
  aiMessage,
  aiAssistantConfig,
} from "@workspace/db/schema";

import {
  and,
  count,
  desc,
  eq,
  gte,
  asc,
} from "@workspace/db";

import {
  getOpenAI,
  getGemini,
} from "@/src/lib/ai/openai-client";

import { aiProvider } from "@workspace/db/ai-providers";
import { buildSystemPrompt } from "@/src/lib/ai/system-prompt";
import { buildPatientContext } from "@/src/lib/ai/build-patient-context";

function toUIMessages(
  rows: Array<{
    id: string;
    role: string;
    content: string;
  }>,
): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    parts: [
      {
        type: "text",
        text: row.content,
      },
    ],
  }));
}

function textFromUIMessage(
  message: UIMessage,
): string {
  return message.parts
    .filter(
      (
        part,
      ): part is {
        type: "text";
        text: string;
      } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

/**
 * What the patient is told when the provider refuses.
 *
 * The provider's own message went straight to the chat before — "You have no
 * credits remaining. Add credits … platform.openai.com/billing" is the
 * clinic's problem, not something to show a patient. The full error is still
 * logged above for whoever fixes it.
 */
function patientFacingError(error: unknown): string {
  const status =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : null;
  const text = error instanceof Error ? error.message.toLowerCase() : "";

  if (status === 429 || /quota|rate limit|resource_exhausted|credit/.test(text)) {
    return "The assistant is busy right now. Please try again in a little while.";
  }
  if (status === 401 || status === 403 || /api key|permission/.test(text)) {
    return "The assistant is not available right now. Please try again later.";
  }
  return "Something went wrong. Please try again.";
}

/** "what was my last hs-crp reading??" → "What was my last hs-crp reading". */
function fallbackTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").replace(/[?!.。]+$/, "").trim();
  const short = clean.length > 48 ? `${clean.slice(0, 48).replace(/\s+\S*$/, "")}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1) || "New chat";
}

/** A 3–6 word name for the chat, or null if the model does not give one. */
async function generateTitle(
  model: Parameters<typeof generateText>[0]["model"],
  question: string,
  answer: string,
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model,
      temperature: 0.3,
      maxOutputTokens: 24,
      prompt:
        "Write a short title (3 to 6 words) for this health chat, in the language of the question. " +
        "Plain text only — no quotes, no full stop, no emoji.\n\n" +
        `Question: ${question.slice(0, 500)}\n\nAnswer: ${answer.slice(0, 800)}`,
    });
    const title = text.replace(/["'*#`]/g, "").replace(/\s+/g, " ").replace(/[.。]+$/, "").trim();
    return title && title.length <= 60 ? title : null;
  } catch (error) {
    console.error("[ai/chat] Title generation failed:", error);
    return null;
  }
}

function startOfTodayUTC(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request: NextRequest,
) {
  const session =
    await auth.api.getSession({
      headers: await headers(),
    });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const requestedId =
    request.nextUrl.searchParams.get(
      "conversationId",
    );

  const conversation = requestedId
    ? await db.query.aiConversation.findFirst({
        where: and(
          eq(
            aiConversation.id,
            requestedId,
          ),
          eq(
            aiConversation.userId,
            session.user.id,
          ),
        ),
      })
    : await db.query.aiConversation.findFirst({
        where: eq(
          aiConversation.userId,
          session.user.id,
        ),
        orderBy: [
          desc(aiConversation.updatedAt),
        ],
      });

  if (requestedId && !conversation) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  if (!conversation) {
    return NextResponse.json({
      conversation: null,
      messages: [],
    });
  }

  const rows =
    await db.query.aiMessage.findMany({
      where: eq(
        aiMessage.conversationId,
        conversation.id,
      ),
      orderBy: [
        asc(aiMessage.createdAt),
      ],
    });

  return NextResponse.json({
    conversation,
    messages: toUIMessages(rows),
  });
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest,
) {
  try {
    /* -----------------------------------------------------
       Authentication
    ----------------------------------------------------- */

    const session =
      await auth.api.getSession({
        headers: await headers(),
      });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    /* -----------------------------------------------------
       Request body
    ----------------------------------------------------- */

    const body = await request
      .json()
      .catch(() => null);

    const chatId =
      typeof body?.id === "string"
        ? body.id
        : null;

    const uiMessages =
      Array.isArray(body?.messages)
        ? (body.messages as UIMessage[])
        : null;

    if (
      !chatId ||
      !uiMessages ||
      uiMessages.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request",
        },
        { status: 400 },
      );
    }

    /* -----------------------------------------------------
       Last user message
    ----------------------------------------------------- */

    const lastMessage =
      uiMessages[
        uiMessages.length - 1
      ];

    if (
      !lastMessage ||
      lastMessage.role !== "user"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request",
        },
        { status: 400 },
      );
    }

    const lastMessageText =
      textFromUIMessage(lastMessage);

    if (!lastMessageText.trim()) {
      return NextResponse.json(
        {
          error:
            "Message cannot be empty",
        },
        { status: 400 },
      );
    }

    const userId =
      session.user.id;

    /* -----------------------------------------------------
       AI CONFIG
    ----------------------------------------------------- */

    const config =
      await db.query.aiAssistantConfig.findFirst();

    console.log(
      "[ai/chat] AI config:",
      config,
    );

    if (!config) {
      return NextResponse.json(
        {
          error:
            "AI assistant configuration not found",
        },
        { status: 503 },
      );
    }

    if (!config.enabled) {
      return NextResponse.json(
        {
          error:
            "AI assistant is disabled",
        },
        { status: 503 },
      );
    }

    if (!config.model) {
      return NextResponse.json(
        {
          error:
            "AI model is not configured",
        },
        { status: 503 },
      );
    }

    /* -----------------------------------------------------
       Daily message limit
    ----------------------------------------------------- */

    const countRows =
      await db
        .select({
          value: count(),
        })
        .from(aiMessage)
        .innerJoin(
          aiConversation,
          eq(
            aiMessage.conversationId,
            aiConversation.id,
          ),
        )
        .where(
          and(
            eq(
              aiConversation.userId,
              userId,
            ),
            eq(
              aiMessage.role,
              "user",
            ),
            gte(
              aiMessage.createdAt,
              startOfTodayUTC(),
            ),
          ),
        );

    const messagesSentToday =
      countRows[0]?.value ?? 0;

    if (
      messagesSentToday >=
      config.dailyMessageLimitPerUser
    ) {
      return NextResponse.json(
        {
          error:
            "Daily message limit reached",
        },
        { status: 429 },
      );
    }

    /* -----------------------------------------------------
       Conversation
    ----------------------------------------------------- */

    const existingConversation =
      await db.query.aiConversation.findFirst({
        where: eq(
          aiConversation.id,
          chatId,
        ),
      });

    if (
      existingConversation &&
      existingConversation.userId !==
        userId
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        { status: 403 },
      );
    }

    const isFirstMessage =
      !existingConversation;

    let conversation =
      existingConversation;

    if (!conversation) {
      const [created] =
        await db
          .insert(aiConversation)
          .values({
            id: chatId,
            userId,
            // Named from the first message straight away, so a chat whose
            // reply fails still has a name. A better one replaces it once
            // the reply is in (see onFinish).
            title: fallbackTitle(lastMessageText),
          })
          .returning();

      if (!created) {
        return NextResponse.json(
          {
            error:
              "Failed to create conversation",
          },
          { status: 500 },
        );
      }

      conversation = created;
    }

    /* -----------------------------------------------------
       Save user message
    ----------------------------------------------------- */

    await db.insert(aiMessage).values({
      conversationId:
        conversation.id,
      role: "user",
      content: lastMessageText,
    });

    /* -----------------------------------------------------
       Patient context
    ----------------------------------------------------- */

    const contextBlock =
      await buildPatientContext(
        userId,
      );

    const systemPrompt =
      buildSystemPrompt(
        config.additionalInstructions,
        contextBlock,
      );

    /* -----------------------------------------------------
       Select AI provider
    ----------------------------------------------------- */

    const modelName =
      config.model.trim();

    // The provider is stored, not guessed from the model name. Matching on
    // "gemini" was a rule about spelling doing the job of a rule about
    // routing, and it broke the first time either vendor named a model
    // outside the pattern.
    const provider = aiProvider(
      config.provider,
    );

    console.log(
      "[ai/chat] Provider:",
      provider.label,
      "Model:",
      modelName,
    );

    let model;

    try {
      model =
        provider.value === "google"
          ? getGemini()(modelName)
          : getOpenAI()(modelName);
    } catch {
      // The factories throw when their key is missing. Without this the
      // patient sees a 500 and the reason is only in a server log, while the
      // fix — one environment variable — is nowhere on screen.
      console.error(
        `[ai/chat] ${provider.envKey} is not set; the assistant cannot run on ${provider.label}`,
      );

      return NextResponse.json(
        {
          error: `The assistant is not configured for ${provider.label} yet. Please try again later.`,
        },
        { status: 503 },
      );
    }

    /* -----------------------------------------------------
       Stream response
    ----------------------------------------------------- */

    const conversationId =
      conversation.id;

    // Fixed here for the title call inside onFinish, which a `let` cannot be.
    const chatModel = model;

    const result =
      streamText({
        model: chatModel,

        system:
          systemPrompt,

        messages:
          await convertToModelMessages(
            uiMessages,
          ),

        temperature:
          config.temperature,

        maxOutputTokens:
          config.maxOutputTokens,

        onFinish:
          async ({
            text,
            usage,
          }) => {
            try {
              await db
                .insert(aiMessage)
                .values({
                  conversationId,

                  role: "assistant",

                  content: text,

                  promptTokens:
                    usage?.inputTokens ??
                    null,

                  completionTokens:
                    usage?.outputTokens ??
                    null,
                });

              await db
                .update(
                  aiConversation,
                )
                .set({
                  updatedAt:
                    new Date(),
                })
                .where(
                  eq(
                    aiConversation.id,
                    conversationId,
                  ),
                );

              // Like Gemini or ChatGPT: after the first exchange the model
              // names the chat from what was actually discussed. One small
              // extra call, first message only; if it fails the name from
              // the question stays. Run after the response, not before its
              // end — awaited here it held the stream open for half a
              // minute after the reply had finished.
              if (isFirstMessage) {
                after(async () => {
                  const title = await generateTitle(chatModel, lastMessageText, text);
                  if (!title) return;
                  await db
                    .update(aiConversation)
                    .set({ title })
                    .where(eq(aiConversation.id, conversationId));
                });
              }

              console.log(
                "[ai/chat] Response saved successfully",
              );
            } catch (error) {
              console.error(
                "[ai/chat] Failed to save response:",
                error,
              );
            }
          },
      });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error(
          "[ai/chat] Streaming error:",
          error,
        );

        return patientFacingError(error);
      },
    });
  } catch (error) {
    console.error(
      "[ai/chat] Request failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reach the AI provider",
      },
      { status: 500 },
    );
  }
}