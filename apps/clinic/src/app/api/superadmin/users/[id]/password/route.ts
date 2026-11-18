import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "@workspace/db";
import { db } from "@workspace/db/client";
import { user as userTable } from "@workspace/db/schema";
import { auth } from "@/src/lib/auth/auth";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";

/**
 * Set a staff member's password.
 *
 * There was no way to do this, which meant a forgotten password had no answer
 * short of deleting the account and making it again — losing everything
 * attached to it. Accounts are created here with a password chosen by whoever
 * created them, so the person who ends up using it often never knew it.
 *
 * Deliberately a set, not a reveal: the existing password cannot be read back,
 * only replaced, because it is stored as a hash and that is the point.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiPermission("clinic.team");
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const newPassword = typeof body?.password === "string" ? body.password : "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Use at least 8 characters." },
        { status: 400 },
      );
    }

    const [target] = await db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });

    await auth.api.setUserPassword({
      headers: await headers(),
      body: { userId: id, newPassword },
    });

    // Logged without the password: someone reading this later needs to know an
    // account's credentials were changed and by whom, which is exactly the
    // kind of change that otherwise leaves no trace at all.
    console.log(
      `[users] ${session.user.email} set a new password for ${target.email}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error setting password:", error);
    return NextResponse.json(
      { error: describeError(error, "Could not set the password") },
      { status: 500 },
    );
  }
}
