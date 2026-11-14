import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getDietProtocol } from "@workspace/db/diet-protocol-store";
import { auth } from "@/src/lib/auth/auth";

/**
 * The signed-in patient's dietary protocol, as their nutritionist saved it —
 * or null before one is written. Always their own: the contact comes from the
 * session, never from the request.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.userId, session.user.id) });
  const contactId =
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.userId, session.user.id) }))?.id ??
    null;
  if (!contactId) return NextResponse.json(null);

  return NextResponse.json(await getDietProtocol(db, contactId));
}
