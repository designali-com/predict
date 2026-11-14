"use client";
import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type UIMessage,
} from "ai";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@workspace/ui/components/ai-elements/conversation";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@workspace/ui/components/ai-elements/message";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@workspace/ui/components/ai-elements/prompt-input";

import {
  Suggestion,
  Suggestions,
} from "@workspace/ui/components/ai-elements/suggestion";

import {
  PanelLeftIcon,
  SquarePenIcon,
} from "lucide-react";
import { Logo } from "../../../logo";
import { PredictMark, PredictSpinner } from "../../../predict-loader";

import {
  ConversationSidebar,
  type ConversationSummary,
} from "./conversation-sidebar";

/** A quick-question chip: a short label, and the full question it sends. */
export interface ChatTopic {
  label: string;
  prompt: string;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}

/**
 * The Predict mark, turning, while the reply is on its way — the same
 * spinner every page in the app uses (see predict-loader.tsx).
 */
function PredictThinking() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 py-1"
    >
      <PredictSpinner />
      <span className="animate-pulse text-sm text-muted-foreground">
        Predict AI is thinking…
      </span>
    </div>
  );
}

function newChatId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

interface PatientAiChatProps {
  initialConversationId?: string;
  initialMessages: UIMessage[];
  /** Made from the patient's own markers — see the AI page. */
  topics: ChatTopic[];
  suggestions: string[];
}

export function PatientAiChat({
  initialConversationId,
  initialMessages,
  topics,
  suggestions,
}: PatientAiChatProps) {
  const [activeId, setActiveId] = useState(
    () => initialConversationId ?? newChatId(),
  );

  const [activeMessages, setActiveMessages] =
    useState<UIMessage[]>(initialMessages);

  const [conversations, setConversations] =
    useState<ConversationSummary[]>([]);

  const [switching, setSwitching] =
    useState(false);

  // Chat history: a column beside the chat on a desktop (open until closed),
  // a drawer over it on a phone (closed until opened) — at phone width a
  // 256px column left the chat squeezed into what was left.
  const [desktopHistory, setDesktopHistory] =
    useState(true);
  const [mobileHistory, setMobileHistory] =
    useState(false);

  const isPhone = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  const toggleHistory = useCallback(() => {
    if (isPhone()) setMobileHistory((v) => !v);
    else setDesktopHistory((v) => !v);
  }, []);

  /**
   * Refresh conversation sidebar.
   */
  const refreshConversations =
    useCallback(async () => {
      try {
        const response = await fetch(
          "/api/patient/ai/conversations",
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        setConversations(
          data.conversations ?? [],
        );
      } catch {
        // Ignore sidebar refresh errors.
      }
    }, []);

  /**
   * Load conversations on mount.
   */
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  /**
   * Select an existing conversation.
   */
  const handleSelect = useCallback(
    async (id: string) => {
      if (
        id === activeId ||
        switching
      ) {
        return;
      }

      setSwitching(true);

      try {
        const response = await fetch(
          `/api/patient/ai/chat?conversationId=${encodeURIComponent(
            id,
          )}`,
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        setActiveId(id);
        setActiveMessages(
          data.messages ?? [],
        );
        setMobileHistory(false);
      } catch (error) {
        console.error(
          "[PatientAiChat] Failed to load conversation:",
          error,
        );
      } finally {
        setSwitching(false);
      }
    },
    [activeId, switching],
  );

  /**
   * Start a new conversation.
   */
  const handleNewChat =
    useCallback(() => {
      setActiveId(newChatId());
      setActiveMessages([]);
      setMobileHistory(false);
    }, []);

  const activeTitle =
    conversations.find((c) => c.id === activeId)?.title ||
    "New chat";

  const sidebarProps = {
    conversations,
    activeId,
    onSelect: handleSelect,
    onNewChat: handleNewChat,
    loading: switching,
  };

  return (
    // No browser scrollbars anywhere in the chat — the message log, the list
    // of chats and the suggestion row all still scroll by wheel, touch and
    // keys, and the log has its own jump-to-latest button. The default bars
    // were a grey stripe down the middle of an otherwise clean pane.
    <div className="relative flex h-full min-h-0 w-full overflow-hidden rounded-xl border bg-background [&_*]:[scrollbar-width:none] [&_*::-webkit-scrollbar]:hidden">
      {/* Desktop: a column, closable. */}
      {desktopHistory && (
        <ConversationSidebar
          {...sidebarProps}
          className="hidden md:flex"
        />
      )}

      {/* Phone: a drawer over the chat, with a backdrop to tap away. */}
      {mobileHistory && (
        <>
          <Button variant="ghost" size="default"
 type="button"
 aria-label="Close chat history"
 onClick={() => setMobileHistory(false)}
 className="absolute inset-0 z-30 bg-black/50 md:hidden h-full w-full rounded-none p-0" />
          <ConversationSidebar
            {...sidebarProps}
            className="absolute inset-y-0 left-0 z-40 w-[82%] max-w-72 bg-background shadow-2xl md:hidden"
          />
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-3">
          <Button variant="ghost" size="default"
 type="button"
 onClick={toggleHistory}
 aria-label="Show or hide chat history"
 className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
            <PanelLeftIcon className="size-[18px]" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {activeTitle}
          </p>
          <Button variant="ghost" size="default"
 type="button"
 onClick={handleNewChat}
 aria-label="New chat"
 className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
            <SquarePenIcon className="size-[18px]" />
          </Button>
        </div>

        <ChatPane
          key={activeId}
          conversationId={activeId}
          initialMessages={activeMessages}
          onConversationChanged={
            refreshConversations
          }
          topics={topics}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}

interface ChatPaneProps {
  conversationId: string;
  initialMessages: UIMessage[];
  onConversationChanged: () => void;
  topics: ChatTopic[];
  suggestions: string[];
}

function ChatPane({
  conversationId,
  initialMessages,
  onConversationChanged,
  topics,
  suggestions,
}: ChatPaneProps) {
  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat({
    id: conversationId,

    messages: initialMessages,

    transport:
      new DefaultChatTransport({
        api: "/api/patient/ai/chat",
      }),

    onFinish: () => {
      onConversationChanged();
      // The chat's name is written by the server after the reply ends,
      // which can land a moment after this — look again shortly.
      setTimeout(onConversationChanged, 2500);
      setTimeout(onConversationChanged, 6000);
    },
  });

  // Waiting on the model: sent, but nothing of the reply has arrived yet.
  // The empty assistant bubble the stream opens with is hidden meanwhile,
  // so the loader stands in its place rather than beside a blank box.
  const lastMessage = messages[messages.length - 1];
  const thinking =
    status === "submitted" ||
    (status === "streaming" &&
      (!lastMessage ||
        lastMessage.role === "user" ||
        messageText(lastMessage).trim() === ""));

  /**
   * Submit prompt.
   */
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text?.trim();

      if (!text) {
        return;
      }

      sendMessage({
        text,
      });
      // A new chat is named from its first message the moment it is saved.
      setTimeout(onConversationChanged, 1500);
    },
    [sendMessage, onConversationChanged],
  );

  /**
   * Biomarker quick action.
   */
  const handleBiomarkerClick =
    useCallback(
      (topic: ChatTopic) => {
        sendMessage({
          text: topic.prompt,
        });
        setTimeout(onConversationChanged, 1500);
      },
      [sendMessage, onConversationChanged],
    );

  /**
   * Suggestion click.
   */
  const handleSuggestionClick =
    useCallback(
      (suggestion: string) => {
        sendMessage({
          text: suggestion,
        });
      },
      [sendMessage],
    );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-2xl px-3 md:px-4">
          {messages.length === 0 ? (
            <ConversationEmptyState>
              {/* The brand in place of a generic sparkle and "Ask Predict
                  AI": the mark, then the wordmark. */}
              <div className="flex flex-col items-center gap-3">
                {/* Sized for each screen: the wordmark carries fixed
                    width/height attributes, so both are set here in its
                    145:23 proportion — "w-auto" alone shrank it to a speck. */}
                <PredictMark className="size-9 md:size-12" />
                <Logo
                  className="h-[25px] w-40 text-foreground md:h-[33px] md:w-52"
                  aria-label="Predict"
                />

                <p className="text-sm text-muted-foreground">
                  Ask about your own reports,
                  biomarkers, and biological
                  age results.
                </p>
              </div>

              {topics.length > 0 && (
                <div className="flex w-full flex-wrap justify-center gap-2 pt-2">
                  {topics.map(
                    (topic) => (
                      <Button variant="ghost" size="default"
 key={topic.label}
 type="button"
 onClick={() =>
 handleBiomarkerClick(
 topic,
 )
 }
 className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
 >
                        {topic.label}
                      </Button>
                    ),
                  )}
                </div>
              )}
            </ConversationEmptyState>
          ) : (
            <>
              {messages
                .filter(
                  (msg) =>
                    !(
                      thinking &&
                      msg === lastMessage &&
                      msg.role === "assistant"
                    ),
                )
                .map((msg) => (
                  <Message
                    key={msg.id}
                    from={msg.role}
                  >
                    <MessageContent>
                      <MessageResponse>
                        {messageText(msg)}
                      </MessageResponse>
                    </MessageContent>
                  </Message>
                ))}
              {thinking && <PredictThinking />}
            </>
          )}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-3 md:p-4">
        {error && (
          <p className="text-xs text-destructive">
            {error.message ||
              "Something went wrong. Please try again."}
          </p>
        )}

        {messages.length > 0 &&
          messages.length < 4 && (
            <Suggestions>
              {suggestions.map(
                (suggestion) => (
                  <Suggestion
                    key={suggestion}
                    suggestion={suggestion}
                    onClick={() =>
                      handleSuggestionClick(
                        suggestion,
                      )
                    }
                  />
                ),
              )}
            </Suggestions>
          )}

        <PromptInput
          onSubmit={handleSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask about your reports or biomarkers..."
            />
          </PromptInputBody>

          <PromptInputFooter>
            <div />

            <PromptInputSubmit
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}