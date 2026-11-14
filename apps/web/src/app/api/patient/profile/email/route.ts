import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { patientRecord, user } from "@workspace/db/schema";
import { and, eq, ne } from "@workspace/db";
import { isPlaceholderEmail, visibleEmail } from "@workspace/db/placeholder-email";
import { auth } from "@/src/lib/auth/auth";

/**
 * The patient's own email. Accounts the clinic made from a mobile number have
 * none (only a placeholder better-auth needs); adding one here is what makes
 * email sign-in — with the password from Settings, or a code — start working.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ email: visibleEmail(me.email) });
}

export async function PUT(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address" }, { status: 400 });
  }
  const email = parsed.data.email;
  if (isPlaceholderEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (email === me.email.toLowerCase()) {
    return NextResponse.json({ email });
  }

  const taken = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.email, email), ne(user.id, me.id)),
  });
  if (taken) {
    return NextResponse.json({ error: "This email is already used by another account." }, { status: 409 });
  }

  await db.update(user).set({ email, emailVerified: false, updatedAt: new Date() }).where(eq(user.id, me.id));
  await db.update(patientRecord).set({ email, updatedAt: new Date() }).where(eq(patientRecord.userId, me.id));

  return NextResponse.json({ email });
}
