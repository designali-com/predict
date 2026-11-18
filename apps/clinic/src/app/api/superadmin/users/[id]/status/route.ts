import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { isAdminRole } from "@/src/lib/auth/config";

const bodySchema = z.object({
  banned: z.boolean(),
  // Shown to the user on their next sign-in attempt, and kept on the
  // record so a later reviewer can see why the account was closed.
  banReason: z.string().trim().max(500).optional(),
});

// Active/inactive toggle — admin and superadmin only, unlike delete which
// is superadmin-only. "Inactive" just bans the account (blocks sign-in);
// it doesn't touch the role or any of the user's data.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot change your own account status" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "banned (boolean) is required" }, { status: 400 });
  }

  try {
    if (parsed.data.banned) {
      // No banExpiresIn: bans here are indefinite and only a person lifts
      // them. better-auth still writes its banExpires column (it sets it to
      // null on unban), so the column stays even though we never use it.
      await auth.api.banUser({
        headers: await headers(),
        body: {
          userId: id,
          banReason: parsed.data.banReason || "No reason given",
        },
      });
    } else {
      await auth.api.unbanUser({ headers: await headers(), body: { userId: id } });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating user status:", error);
    const message = error?.body?.message || error?.message || "Failed to update user status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
