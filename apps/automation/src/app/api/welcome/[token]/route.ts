import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db/client";
import { completeWelcome, type AuthContextLike } from "@workspace/db/staff-welcome";
import { auth } from "@/src/lib/auth/auth";

/** A new staff member sets their own password from their welcome link, and is signed in. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await completeWelcome(db, (await auth.$context) as unknown as AuthContextLike, {
    token,
    password,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "",
    userAgent: req.headers.get("user-agent") ?? "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { cookie } = result;
  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  response.cookies.set(cookie.name, cookie.value, {
    path: cookie.path,
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "lax",
    maxAge: cookie.maxAge,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  });
  return response;
}
