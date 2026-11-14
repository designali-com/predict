import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { task, contact, user } from "@workspace/db/schema";
import { aliasedTable, eq, desc, and, isNull, or, ilike, sql, type SQL } from "@workspace/db";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";

/**
 * The work queue. `scope` is what makes it a pull queue rather than an
 * allocation: automation creates every task unassigned (assignedRole set,
 * assignedUserId null), and a coach takes one when they start on it. Nobody
 * hands leads out in advance.
 *
 *   mine       — I claimed it
 *   unclaimed  — nobody has, up for grabs
 *   (default)  — everything
 *
 * contactStage rides along because the same queue now carries two very
 * different jobs: chasing a lead who hasn't booked, and answering a patient
 * who reported a problem. The coach needs to know which before they dial.
 */
// Aliased up front so both joins read clearly at the call site.
const assignee = aliasedTable(user, "assignee");
const creator = aliasedTable(user, "creator");

export async function GET(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  const status = url.searchParams.get("status");
  const scope = url.searchParams.get("scope");
  const query = url.searchParams.get("q")?.trim();
  const type = url.searchParams.get("type");
  // ?page=2&pageSize=50 pages the list (the Tasks page). Without a page the
  // whole list comes back, as a person's own Tasks tab expects.
  const paged = url.searchParams.has("page");
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = [25, 50, 100, 200].includes(requestedSize) ? requestedSize : 50;
  const requestedPage = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));

  // Scoped through the contact: a task is about a person, and that person
  // belongs to one clinic.
  const conditions: SQL[] = [eq(contact.clinicId, context.clinic.id)];
  if (type) conditions.push(eq(task.type, type));
  if (query) {
    const like = `%${query}%`;
    const match = or(ilike(task.title, like), ilike(contact.name, like), ilike(contact.phone, like));
    if (match) conditions.push(match);
  }
  if (contactId) conditions.push(eq(task.contactId, contactId));
  if (status) conditions.push(eq(task.status, status));
  if (scope === "mine") conditions.push(eq(task.assignedUserId, context.session.user.id));
  if (scope === "unclaimed") conditions.push(isNull(task.assignedUserId));

  const where = conditions.length ? and(...conditions) : undefined;

  // The whole match, and how many of it are open past their due time — the
  // header's "overdue" is about every page, not the one on screen.
  const [counted] = paged
    ? await db
        .select({
          total: sql<number>`count(*)::int`,
          // "now" from here, as drizzle writes due_at (UTC), not the database's clock.
          overdue: sql<number>`count(*) filter (where ${task.status} = 'open' and ${task.dueAt} < ${new Date().toISOString()}::timestamp)::int`,
        })
        .from(task)
        .innerJoin(contact, eq(task.contactId, contact.id))
        .where(where)
    : [];
  const total = counted?.total ?? 0;
  // Done or taken tasks leave the list between loads; past the end shows the last page.
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));

  const base = db
    .select({
      id: task.id,
      contactId: task.contactId,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactStage: contact.stage,
      type: task.type,
      title: task.title,
      notes: task.notes,
      assignedRole: task.assignedRole,
      assignedUserId: task.assignedUserId,
      assignedUserName: assignee.name,
      createdByUserId: task.createdByUserId,
      createdByName: creator.name,
      createdByRunId: task.createdByRunId,
      dueAt: task.dueAt,
      status: task.status,
      createdAt: task.createdAt,
    })
    .from(task)
    .innerJoin(contact, eq(task.contactId, contact.id))
    // Two joins onto the same table, so both need their own alias — without
    // them the assignee's name would overwrite the creator's.
    .leftJoin(assignee, eq(task.assignedUserId, assignee.id))
    .leftJoin(creator, eq(task.createdByUserId, creator.id))
    .where(where)
    .orderBy(desc(task.createdAt), desc(task.id));

  if (!paged) return NextResponse.json({ tasks: await base });

  const rows = await base.limit(pageSize).offset((page - 1) * pageSize);
  return NextResponse.json({ tasks: rows, total, overdue: counted?.overdue ?? 0, page, pageSize });
}

export async function POST(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const body = await req.json().catch(() => null);
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  const type = typeof body?.type === "string" && body.type ? body.type : "follow_up";
  const title = typeof body?.title === "string" ? body.title : "";
  const assignedRole = typeof body?.assignedRole === "string" && body.assignedRole ? body.assignedRole : null;
  const dueAt = typeof body?.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
  const notes = typeof body?.notes === "string" && body.notes ? body.notes : null;

  if (!contactId || !title) {
    return NextResponse.json({ error: "contactId and title are required" }, { status: 400 });
  }

  // The queue above only lists tasks on this clinic's contacts, so a task on
  // anyone else's would be written and then never seen.
  const [person] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.clinicId, context.clinic.id)))
    .limit(1);
  if (!person) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const [row] = await db
    .insert(task)
    .values({
      clinicId: context.clinic.id,
      contactId,
      type,
      title,
      assignedRole,
      dueAt,
      notes,
      createdByUserId: session.user.id,
    })
    .returning();

  return NextResponse.json({ task: row }, { status: 201 });
}
