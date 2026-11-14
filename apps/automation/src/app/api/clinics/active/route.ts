import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { canAccessClinic } from "@workspace/db/clinic-service";
import { ACTIVE_CLINIC_COOKIE, clinicContext } from "@/src/lib/auth/clinic";

/**
 * Switches which clinic the person is working in.
 *
 * The cookie is only ever written after the membership is checked here, and
 * it is checked again on every request that reads it — a cookie edited by
 * hand gets someone their own clinic back, never somebody else's.
 */
export async function POST(req: Request) {
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { clinicId?: string } | null;
  const clinicId = body?.clinicId;
  if (!clinicId) return NextResponse.json({ error: "Which clinic?" }, { status: 400 });

  if (!(await canAccessClinic(db, context.session.user, clinicId))) {
    return NextResponse.json({ error: "You do not work at that clinic" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, clinicId });
  response.cookies.set(ACTIVE_CLINIC_COOKIE, clinicId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
