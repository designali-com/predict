import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { clinic, contact, doctorAvailability, task, user } from "@workspace/db/schema";
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "@workspace/db";
import { canAccessClinic, clinicStaff, isSuperadmin, removeMembership, setMembership } from "@workspace/db/clinic-service";
import { getRole, landingPanelForRole, staffRoles } from "@workspace/db/role-service";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { sendMail } from "@workspace/communication";
import { issueWelcomeLink } from "@workspace/db/staff-welcome";
import { CLINIC_URL } from "@/src/lib/auth/panel";
import { auth } from "@/src/lib/auth/auth";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/** Who works at this clinic, and everyone who could be added to it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const [staff, roles, everyone] = await Promise.all([
    clinicStaff(db, id),
    staffRoles(db),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(
        and(
          isNotNull(user.role),
          notInArray(user.role, ["user", "patient", "superadmin"]),
          sql`coalesce(${user.banned}, false) = false`,
        ),
      )
      .orderBy(asc(user.name)),
  ]);

  // A superadmin runs every clinic from above — they are not one clinic's
  // team, so they are neither listed nor offered as a role here.
  return NextResponse.json({
    staff: staff.filter((s) => s.role !== "superadmin"),
    // Who is looking: their own row cannot be removed or demoted from here.
    me: context.session.user.id,
    roles: roles.filter((r) => r.key !== "superadmin").map((r) => ({ key: r.key, label: r.label })),
    // Somebody can work at two clinics, so people already here are offered
    // again elsewhere — they are only filtered out of *this* clinic's picker.
    addable: everyone.filter((u) => !staff.some((s) => s.userId === u.id)),
  });
}

/** Put somebody in this clinic, or change the role they hold here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const role = typeof b.role === "string" ? b.role : "";
  const roleRecord = role ? await getRole(db, role) : null;
  if (!roleRecord) return NextResponse.json({ error: "Pick a role" }, { status: 400 });
  if (roleRecord.key === "superadmin") {
    return NextResponse.json({ error: "Superadmin is not a clinic role" }, { status: 400 });
  }

  // Somebody new: a staff login made here, in this clinic, in one step.
  if (b.newUser && typeof b.newUser === "object") {
    const n = b.newUser as Record<string, unknown>;
    const name = typeof n.name === "string" ? n.name.trim() : "";
    const email = typeof n.email === "string" ? n.email.trim().toLowerCase() : "";
    if (!name) return NextResponse.json({ error: "Enter their name" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email — it is their login" }, { status: 400 });
    }
    const existing = await db.query.user.findFirst({
      columns: { id: true, banned: true },
      where: eq(user.email, email),
    });
    // Somebody whose login was switched off when they left another clinic
    // comes back as the same user, so their notes and history stay theirs.
    // Only a superadmin switches a login off, so only one switches it back on.
    const returning = !!existing?.banned && isSuperadmin(context.session.user.role);
    if (existing && !returning) {
      return NextResponse.json(
        {
          error: existing.banned
            ? `${email}'s login was switched off — only a superadmin can add them back.`
            : `${email} already has a login — add them from "Existing staff" instead.`,
        },
        { status: 409 },
      );
    }

    const password = generatePassword();
    let memberId: string;
    if (existing) {
      await auth.api.unbanUser({ headers: await headers(), body: { userId: existing.id } });
      // Their old password is not handed back; the fallback shown is this one.
      await auth.api.setUserPassword({ headers: await headers(), body: { userId: existing.id, newPassword: password } });
      await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, existing.id));
      memberId = existing.id;
    } else {
      // createUser, not signUpEmail: it needs an admin session (a superadmin or
      // admin is who is here) and never signs anybody in, so the person doing
      // this stays signed in as themselves.
      const created = await auth.api.createUser({
        headers: await headers(),
        body: { name, email, password, data: { emailVerified: true } },
      });
      memberId = created.user.id;
    }
    // Written to the column rather than handed to better-auth, which only
    // accepts the roles it knew at start-up — not ones made on the Roles page.
    await db.update(user).set({ role: roleRecord.key, updatedAt: new Date() }).where(eq(user.id, memberId));
    await setMembership(db, { clinicId: id, userId: memberId, role: roleRecord.key });

    // Their way in: a welcome link where they choose their own password, on
    // whichever app their role works in. Nothing secret travels in a message —
    // WhatsApp cannot carry a password anyway (Meta rejects the template).
    const [clinicRow] = await db.select({ name: clinic.name }).from(clinic).where(eq(clinic.id, id)).limit(1);
    const clinicName = clinicRow?.name ?? "Predict";
    const panel = await landingPanelForRole(db, roleRecord.key);
    const appUrl = panel === "operations" ? (process.env.BETTER_AUTH_URL ?? "") : CLINIC_URL;
    const welcome = await issueWelcomeLink(db, {
      userId: memberId,
      createdByUserId: context.session.user.id,
      appUrl,
    });
    const phoneRaw = typeof n.phone === "string" ? n.phone.trim() : "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    // The admin sends it from their own WhatsApp (no template to wait for):
    // the popup opens wa.me with this text ready.
    const message =
      `Hi ${name}, welcome to the ${clinicName} team! 🎉\n\n` +
      `Set your password and sign in here (link works for 7 days):\n${welcome.url}\n\n` +
      `Your login email is ${email}.`;

    const delivery: { email?: { ok: boolean; error?: string } } = {};
    if (b.sendEmail === true) {
      const mail = await sendMail({
        to: email,
        subject: `Welcome to ${clinicName} — set your password`,
        text: [
          `Hi ${name},`,
          ``,
          `Welcome to the ${clinicName} team! Your account is ready.`,
          ``,
          `Set your password and sign in here (the link works once, for 7 days):`,
          welcome.url,
          ``,
          `Your login email: ${email}`,
          ``,
          `— ${clinicName}`,
        ].join("\n"),
      });
      delivery.email = mail.ok ? { ok: true } : { ok: false, error: mail.error };
    }

    return NextResponse.json(
      {
        ok: true,
        // The generated password stays as a fallback the admin can read out;
        // the link is the intended way in. Shown once — only the hash is stored.
        credentials: { email, password, loginUrl: appUrl },
        welcome: {
          url: welcome.url,
          expiresAt: welcome.expiresAt,
          message,
          whatsappTo: phone?.ok ? phone.phone : null,
        },
        delivery,
      },
      { status: 201 },
    );
  }

  const userId = typeof b.userId === "string" ? b.userId : "";
  if (!userId) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
  // Changing your own role here could take away the page you are on.
  if (userId === context.session.user.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  await setMembership(db, { clinicId: id, userId, role: roleRecord.key });
  return NextResponse.json({ ok: true });
}

/**
 * A password nobody has to think of and nobody reuses — read out once, then
 * only ever reset. Characters that get misread over a phone line are left out.
 */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const body = Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
  return `${body}#${randomBytes(1)[0]! % 10}`;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  // Removing yourself from the clinic you are standing in would lock you out
  // of the screen you are on.
  if (userId === context.session.user.id) {
    return NextResponse.json({ error: "You cannot remove yourself from this clinic" }, { status: 400 });
  }

  const disableLogin = new URL(req.url).searchParams.get("disableLogin") === "1";
  if (disableLogin && !isSuperadmin(context.session.user.role)) {
    return NextResponse.json({ error: "Only a superadmin can switch a login off" }, { status: 403 });
  }

  await removeMembership(db, id, userId);

  // What they were holding here goes back to the team, so nothing waits on
  // somebody who no longer works here:
  // - their open leads return to the role's pool (the next caller claims them),
  const released = await db
    .update(contact)
    .set({ assignedUserId: null, updatedAt: new Date() })
    .where(and(eq(contact.clinicId, id), eq(contact.assignedUserId, userId), inArray(contact.stage, ["LEAD", "BOOKED"])))
    .returning({ id: contact.id });
  // - their open tasks go back to the role,
  await db
    .update(task)
    .set({ assignedUserId: null })
    .where(and(eq(task.clinicId, id), eq(task.assignedUserId, userId), eq(task.status, "open")));
  // - and their hours here stop offering slots, so nothing new is booked
  //   with them. Booked appointments are left for the clinic to move.
  await db
    .update(doctorAvailability)
    .set({ isActive: false })
    .where(and(eq(doctorAvailability.clinicId, id), eq(doctorAvailability.doctorUserId, userId)));

  // Switched off, never deleted: deleting the user would also delete the
  // clinical notes they wrote and their availability history (those rows
  // cascade). Banned, they cannot sign in anywhere and every session ends.
  if (disableLogin) {
    await auth.api.banUser({
      headers: await headers(),
      body: { userId, banReason: `Removed from clinic by ${context.session.user.email}` },
    });
  }

  return NextResponse.json({ ok: true, leadsReleased: released.length, loginDisabled: disableLogin });
}
