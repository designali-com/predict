/**
 * Which service answers the patient assistant, and on which model.
 *
 * The provider used to be inferred from the model name — anything starting
 * "gemini" went to Google — which is a rule about spelling standing in for a
 * rule about routing. It breaks the first time either vendor names a model
 * outside the pattern, and it leaves an admin screen with nothing honest to
 * offer: a provider dropdown would have had to encode its answer in the model
 * string. So the provider is stored, and the model is just a name passed
 * through to it.
 */
export const AI_PROVIDERS = [
  {
    value: "openai",
    label: "OpenAI",
    /** The environment variable the patient app reads for this provider. */
    envKey: "OPENAI_API_KEY",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    value: "google",
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    // The 1.5 and 2.0 generations are retired — the API refuses them with
    // "no longer available". Keep this list to models Google still serves
    // (checked against the key's own model list, September 2026).
    models: [
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
] as const;

/**
 * What an admin should know when picking a model — mainly the free-tier
 * daily cap, which is what decides whether the assistant is still answering
 * by lunchtime. From Google's rate-limit page for this project; change them
 * here if the project moves to a paid tier.
 */
export const AI_MODEL_NOTES: Record<string, string> = {
  "gemini-3.6-flash": "Free tier: 20 requests/day",
  "gemini-3.7-flash": "Free tier: 20 requests/day",
  "gemini-3.8-flash": "Free tier: 20 requests/day",
  "gemini-3.5-flash": "Free tier: 20 requests/day",
  "gemini-3.5-flash-lite": "Free tier: 500 requests/day",
  "gemini-3.1-flash-lite": "Free tier: 500 requests/day",
  "gemini-2.5-flash": "Free tier: 20 requests/day",
  "gemini-2.5-flash-lite": "Free tier: 20 requests/day",
};

export type AiProvider = (typeof AI_PROVIDERS)[number]["value"];

export const AI_PROVIDER_VALUES = AI_PROVIDERS.map((p) => p.value) as [AiProvider, ...AiProvider[]];

/**
 * The provider a stored value names, falling back to the first.
 *
 * The return type widens `models` from the literal tuple `as const` produces:
 * callers ask "is this saved model one of yours", which a tuple of literals
 * refuses to answer for an arbitrary string.
 */
export function aiProvider(value: string | null | undefined): {
  value: AiProvider;
  label: string;
  envKey: string;
  models: readonly string[];
} {
  return AI_PROVIDERS.find((p) => p.value === value) ?? AI_PROVIDERS[0];
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && AI_PROVIDERS.some((p) => p.value === value);
}
