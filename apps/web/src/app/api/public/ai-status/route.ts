import { NextResponse } from "next/server";
import { AI_PROVIDERS } from "@workspace/db/ai-providers";

/**
 * Which AI providers this app has a key for — true or false, never the key.
 *
 * The superadmin screen lives in the clinic app, a separate process with its
 * own environment, so it cannot see these keys itself; it used to check its
 * own and warn "no GEMINI_API_KEY" when the key was set here all along. It
 * asks this instead.
 *
 * Public on purpose (server-to-server, no session to pass): "a Gemini key is
 * configured" says nothing an attacker can use.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    providers: Object.fromEntries(AI_PROVIDERS.map((p) => [p.value, Boolean(process.env[p.envKey])])),
  });
}
