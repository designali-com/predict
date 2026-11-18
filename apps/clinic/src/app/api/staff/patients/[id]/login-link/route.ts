import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate, contact, patientRecord, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import {
  LOGIN_LINK_DAYS,
  activeLoginLink,
  ensurePatientLogin,
  issueLoginLink,
  issuePreviewLink,
  loginSummary,
  patientSetupStatus,
  revokeLoginLinks,
  setAppAccess,
  visibleEmail,
} from "@workspace/db/login-link";
import { sendCommunication, sendMail } from "@workspace/communication";
import { clinicModules } from "@workspace/db/clinic-modules";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { PATIENT_URL } from "@/src/lib/auth/config";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";

/**
 * The patient's app access, one step at a time.
 *
 * GET     whether there is a login yet and its details, the live sign-in
 *         link, setup status (is there anything on the dashboard yet), and
 *         where a link can go (WhatsApp template approved? a real email?)
 *
 * POST    { action }
 *   create                  make the login from the chart's mobile — never
 *                           done at registration any more
 *   link, via: whatsapp |   a new sign-in link (the previous one stops
 *     email | copy          working), sent the way chosen, or just returned
 *   preview                 a ten-minute link for staff to open the dashboard
 *                           as the patient sees it; the patient's link is
 *                           left alone
 *   disable | enable        switch app access off (signed out, every way in
 *                           closed) or back on — nothing is deleted
 *
 * DELETE  revoke the live link
 */

/** The approved WhatsApp template: "Hi {{1}}, your results are in…" with a "See your reports" button to /l/{{1}}. */
const RESULTS_TEMPLATE = "results_ready_login";

async function chartFor(id: string) {
  return (
    (await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) })) ??
    (await db.query.patientRecord.findFirst({ where: eq(patientRecord.contactId, id) })) ??
    null
  );
}

async function templateStatus() {
  const row = await db.query.communicationTemplate.findFirst({
    columns: { submissionStatus: true },
    where: eq(communicationTemplate.key, RESULTS_TEMPLATE),
  });
  return row?.submissionStatus ?? "missing";
}

type Chart = NonNullable<Awaited<ReturnType<typeof chartFor>>>;

/** A real address to email the link to: the account's, else the chart's or contact's. */
async function emailFor(chart: Chart, userId: string | null): Promise<string | null> {
  const account = userId
    ? await db.query.user.findFirst({ columns: { email: true }, where: eq(user.id, userId) })
    : null;
  const person = chart.contactId
    ? await db.query.contact.findFirst({ columns: { email: true }, where: eq(contact.id, chart.contactId) })
    : null;
  return visibleEmail(account?.email) ?? visibleEmail(chart.email) ?? visibleEmail(person?.email) ?? null;
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The patient app is Predict's: it shows blood values, biological age and
 * muscle age, which only a clinic with the Diagnosis module produces. A clinic
 * without it (OPTM) gives no new logins — its patients get the app when they
 * are referred to Predict. Logins made before keep working.
 */
const appOffered = (clinic: { modules?: string[] | null }) => clinicModules(clinic).has("diagnosis");

const linkUrl = (token: string) => `${PATIENT_URL.replace(/\/$/, "")}/l/${token}`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor((await params).id);
  if (!chart) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const login = chart.userId ? await loginSummary(db, chart.userId) : null;
  return NextResponse.json({
    setup: await patientSetupStatus(db, chart.id),
    hasLogin: Boolean(login),
    login,
    link: login ? await activeLoginLink(db, chart.userId!) : null,
    days: LOGIN_LINK_DAYS,
    whatsappTemplate: await templateStatus(),
    email: await emailFor(chart, chart.userId),
    appOffered: appOffered(context.clinic),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor((await params).id);
  if (!chart) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; via?: string } | null;
  const action = body?.action;
  const by = context.session.user.id;

  // ---------------------------------------------------------------- create
  if (action === "create") {
    if (!appOffered(context.clinic)) {
      return NextResponse.json({ error: "This clinic does not give the patient app — refer the patient to Predict for it" }, { status: 403 });
    }
    const login = await ensurePatientLogin(db, chart.id);
    if (!login.ok) return NextResponse.json({ error: login.error }, { status: 409 });
    return NextResponse.json({ ok: true, created: login.created });
  }

  // Everything else acts on a login that exists.
  if (!chart.userId) return NextResponse.json({ error: "Create the login first." }, { status: 409 });
  const userId = chart.userId;

  if (action === "disable" || action === "enable") {
    await setAppAccess(db, userId, action === "enable");
    return NextResponse.json({ ok: true });
  }

  const account = await db.query.user.findFirst({ columns: { banned: true }, where: eq(user.id, userId) });
  if (account?.banned) {
    return NextResponse.json({ error: "App access is switched off. Switch it on first." }, { status: 409 });
  }

  // ---------------------------------------------------------------- preview
  if (action === "preview") {
    const { token } = await issuePreviewLink(db, { userId, createdByUserId: by });
    return NextResponse.json({ url: linkUrl(token) });
  }

  // ---------------------------------------------------------------- link
  if (action !== "link") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const via = body?.via === "whatsapp" || body?.via === "email" ? body.via : "copy";

  if (via === "whatsapp") {
    if ((await templateStatus()) !== "approved") {
      return NextResponse.json({ error: "The WhatsApp template isn't approved yet." }, { status: 409 });
    }
    if (!chart.contactId) return NextResponse.json({ error: "This chart has no contact to message." }, { status: 409 });
  }
  const email = via === "email" ? await emailFor(chart, userId) : null;
  if (via === "email" && !email) {
    return NextResponse.json({ error: "There is no email address for this patient — add one first." }, { status: 409 });
  }

  const { token, expiresAt } = await issueLoginLink(db, { userId, createdByUserId: by });
  const url = linkUrl(token);
  const firstName = chart.firstName?.trim() || "there";

  if (via === "whatsapp") {
    const result = await sendCommunication({
      contactId: chart.contactId!,
      templateKey: RESULTS_TEMPLATE,
      variables: { name: firstName },
      // The button is "…/l/{{1}}": the token is its value.
      buttonParameters: [token],
      sentBy: by,
    });
    if (result.status !== "sent") {
      // The link is made either way; say plainly that the message did not go.
      return NextResponse.json(
        {
          url,
          expiresAt,
          error:
            result.status === "skipped_no_consent"
              ? "The patient has opted out of WhatsApp messages — nothing was sent. Copy the link instead."
              : `WhatsApp refused the message: ${result.error ?? "no reason given"}`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ url, expiresAt, sentVia: "whatsapp" });
  }

  if (via === "email") {
    const result = await sendMail({
      to: email!,
      subject: "Your Predict dashboard",
      text:
        `Hi ${firstName},\n\n` +
        `Your Predict dashboard is ready. Open it with this link — no password needed:\n\n${url}\n\n` +
        `The link works for ${LOGIN_LINK_DAYS} days. Please don't share it: it signs in to your own account.\n\n` +
        `— Predict`,
      html:
        `<p>Hi ${escapeHtml(firstName)},</p>` +
        `<p>Your Predict dashboard is ready. Open it with the button below — no password needed.</p>` +
        `<p><a href="${url}" style="display:inline-block;background:#8504FE;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open my dashboard</a></p>` +
        `<p style="color:#666;font-size:13px">The link works for ${LOGIN_LINK_DAYS} days. Please don't share it: it signs in to your own account.</p>` +
        `<p>— Predict</p>`,
    });
    if (!result.ok) {
      return NextResponse.json({ url, expiresAt, error: `The email did not go: ${result.error ?? "unknown error"}` }, { status: 502 });
    }
    return NextResponse.json({ url, expiresAt, sentVia: "email", to: email });
  }

  return NextResponse.json({ url, expiresAt });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor((await params).id);
  if (!chart?.userId) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  await revokeLoginLinks(db, chart.userId);
  return NextResponse.json({ ok: true });
}
