import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

let openaiClient:
  | ReturnType<typeof createOpenAI>
  | null = null;

let geminiClient:
  | ReturnType<
      typeof createGoogleGenerativeAI
    >
  | null = null;

export function getOpenAI() {
  if (!openaiClient) {
    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set",
      );
    }

    openaiClient =
      createOpenAI({
        apiKey,
      });
  }

  return openaiClient;
}

export function getGemini() {
  if (!geminiClient) {
    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set",
      );
    }

    geminiClient =
      createGoogleGenerativeAI({
        apiKey,
      });
  }

  return geminiClient;
}