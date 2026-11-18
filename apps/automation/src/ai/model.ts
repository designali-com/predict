import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { aiProvider } from "@workspace/db/ai-providers";

// Keys live in the environment, never in the database — the config row picks
// the provider and model by name only.
let openai: ReturnType<typeof createOpenAI> | null = null;
let google: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export class MissingApiKeyError extends Error {}

/** The model named by the config row, ready to call. */
export function modelFor(provider: string, model: string): LanguageModel {
  const resolved = aiProvider(provider);
  if (resolved.value === "google") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError("GEMINI_API_KEY is not set");
    google ??= createGoogleGenerativeAI({ apiKey });
    return google(model);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY is not set");
  openai ??= createOpenAI({ apiKey });
  return openai(model);
}
