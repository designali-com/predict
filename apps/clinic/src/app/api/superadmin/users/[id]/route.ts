import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { getUserById } from "@/src/utils/user";
import { canViewUserDirectory, resolveRole } from "@/src/lib/auth/config";
import { syncContactPhoneForUser } from "@/src/lib/contact";
import { getPatientByUserId, upsertPatient } from "@/src/lib/patients";
import { describeError } from "@/src/lib/api-error";

async function requireDirectoryViewer() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canViewUserDirectory(session.user.role)) {
    return null;
  }
  return session;
}

// Deleting a user is destructive and irreversible, so it's held to a
// tighter bar than the rest of the directory (which admin/health_coach can
// also view/edit) — superadmin only.
async function requireSuperadmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || resolveRole(session.user.role) !== "superadmin") {
    return null;
  }
  return session;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireDirectoryViewer();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const user = await getUserById(id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 },
    );
  }
}

// Staff-side patient edit — currently just the mobile number, since that's
// the field the automation dashboard's audience/messaging features need
// and there was previously no way to set it except the patient's own
// profile page.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireDirectoryViewer();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!("mobileNumber" in (body ?? {}))) {
    return NextResponse.json({ error: "mobileNumber is required" }, { status: 400 });
  }

  const mobileNumber =
    typeof body.mobileNumber === "string" && body.mobileNumber.trim() ? body.mobileNumber.trim() : null;

  if (!mobileNumber) {
    return NextResponse.json({ error: "mobileNumber cannot be empty" }, { status: 400 });
  }

  try {
    const existing = await getPatientByUserId(id);
    if (!existing) {
      return NextResponse.json(
        {
          error:
            "This patient hasn't completed their profile (gender/date of birth) yet — mobile number can't be saved until they do.",
        },
        { status: 409 },
      );
    }

    await upsertPatient({ userId: id, mobileNumber });
    await syncContactPhoneForUser(id, mobileNumber);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating patient mobile number:", error);
    return NextResponse.json({ error: "Failed to update mobile number" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Everything inside the try, session check included: an error escaping the
  // handler is served as an HTML page, which the caller cannot parse and which
  // tells nobody what went wrong.
  try {
    const session = await requireSuperadmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 },
      );
    }

    await auth.api.removeUser({
      headers: await headers(),
      body: { userId: id },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: describeError(error, "Failed to delete user") },
      { status: 500 },
    );
  }
}
