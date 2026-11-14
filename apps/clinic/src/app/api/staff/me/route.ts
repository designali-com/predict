import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { auth } from "@/src/lib/auth/auth";
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service";
import { formOwnersFor } from "@workspace/db/clinical-forms";

/**
 * Who is signed in, and what may they do.
 *
 * A client component cannot ask the session directly, so panels that must not
 * render for the wrong job — the consultation fee, the clinical forms — read
 * this. Hiding a panel is not access control: every route behind them checks
 * the same permission server-side. This only stops a nutritionist being shown
 * a fee box that would refuse her anyway.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role ?? "";
  const permissions = await grantedPermissions(db, session.user);
  const held = new Set(permissions);

  // Which forms this account fills in — and, from the same answer, which
  // parts of the visit are its job at all. See formOwnersFor.
  const formOwners = formOwnersFor(role, held, isUnrestricted(role));

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    role,
    permissions,
    formOwners,
  });
}
