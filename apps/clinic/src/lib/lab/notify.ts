import { db } from "@workspace/db/client";
import { bloodTestOrder, communicationTemplate, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getLabOrder } from "@workspace/db/lab-orders";
import { sendCommunication, sendMail } from "@workspace/communication";

/**
 * What the lab tells people as an order moves.
 *
 *   prescribed  → the patient: a Predict blood test has been written for you
 *   booked      → the patient: when and where the sample will be taken
 *   on the way  → the patient: our technician is coming
 *   collected   → the patient: sample taken, the report goes to your doctor
 *   reported    → the doctor who wrote it: the report is ready to read
 *
 * The patient messages are WhatsApp templates, and go only once Meta has
 * approved them; until then this returns "template not approved" and nothing
 * is sent. The doctor hears by email — their chart already shows the status.
 * A failed message never undoes the change that triggered it.
 */

export const LAB_TEMPLATES = {
  prescribed: "blood_test_prescribed",
  booked: "blood_test_booked",
  onTheWay: "blood_test_on_the_way",
  collected: "blood_test_collected",
} as const;

type Result = { sent: boolean; reason?: string };

async function approved(key: string): Promise<boolean> {
  const [row] = await db
    .select({ status: communicationTemplate.submissionStatus })
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, key))
    .limit(1);
  return row?.status === "approved";
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function slotText(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function notifyTestPrescribed(orderId: string): Promise<Result> {
  const detail = await getLabOrder(db, orderId);
  if (!detail?.patient.contactId) return { sent: false, reason: "no patient contact" };
  if (!(await approved(LAB_TEMPLATES.prescribed))) return { sent: false, reason: "template not approved" };
  const result = await sendCommunication({
    contactId: detail.patient.contactId,
    templateKey: LAB_TEMPLATES.prescribed,
    variables: { name: firstName(detail.patient.name), doctor: detail.order.orderedBy ?? "your doctor" },
    idempotencyKey: `lab-prescribed:${orderId}`,
  });
  return { sent: result.status === "sent", reason: result.error };
}

export async function notifyCollectionBooked(orderId: string): Promise<Result> {
  const detail = await getLabOrder(db, orderId);
  if (!detail?.patient.contactId || !detail.order.scheduledAt) return { sent: false, reason: "not booked" };
  if (!(await approved(LAB_TEMPLATES.booked))) return { sent: false, reason: "template not approved" };
  const where =
    detail.order.collectionMode === "home"
      ? `at your home (${detail.order.collectionAddress ?? "address on file"})`
      : "at the Predict centre";
  const result = await sendCommunication({
    contactId: detail.patient.contactId,
    templateKey: LAB_TEMPLATES.booked,
    variables: { name: firstName(detail.patient.name), when: slotText(detail.order.scheduledAt), where },
    // A new slot is a new message: the key carries the time.
    idempotencyKey: `lab-booked:${orderId}:${detail.order.scheduledAt}`,
  });
  return { sent: result.status === "sent", reason: result.error };
}

export async function notifyOnTheWay(orderId: string): Promise<Result> {
  const detail = await getLabOrder(db, orderId);
  if (!detail?.patient.contactId) return { sent: false, reason: "no patient contact" };
  if (!(await approved(LAB_TEMPLATES.onTheWay))) return { sent: false, reason: "template not approved" };
  const result = await sendCommunication({
    contactId: detail.patient.contactId,
    templateKey: LAB_TEMPLATES.onTheWay,
    variables: { name: firstName(detail.patient.name), technician: detail.order.technician ?? "our technician" },
    idempotencyKey: `lab-on-the-way:${orderId}:${detail.order.onTheWayAt ?? ""}`,
  });
  return { sent: result.status === "sent", reason: result.error };
}

export async function notifyCollected(orderId: string): Promise<Result> {
  const detail = await getLabOrder(db, orderId);
  if (!detail?.patient.contactId) return { sent: false, reason: "no patient contact" };
  if (!(await approved(LAB_TEMPLATES.collected))) return { sent: false, reason: "template not approved" };
  const result = await sendCommunication({
    contactId: detail.patient.contactId,
    templateKey: LAB_TEMPLATES.collected,
    variables: { name: firstName(detail.patient.name), doctor: detail.order.orderedBy ?? "your doctor" },
    idempotencyKey: `lab-collected:${orderId}`,
  });
  return { sent: result.status === "sent", reason: result.error };
}

/** Email the doctor who wrote the order that its report is in. */
export async function notifyReportReady(orderId: string, clinicUrl: string): Promise<Result> {
  const detail = await getLabOrder(db, orderId);
  if (!detail) return { sent: false, reason: "no order" };
  const [order] = await db
    .select({ email: user.email, name: user.name })
    .from(bloodTestOrder)
    .innerJoin(user, eq(user.id, bloodTestOrder.orderedByUserId))
    .where(eq(bloodTestOrder.id, orderId))
    .limit(1);
  if (!order?.email || order.email.endsWith(".invalid")) return { sent: false, reason: "doctor has no email" };
  const link = `${clinicUrl.replace(/\/$/, "")}/people/${detail.patient.chartId}`;
  const result = await sendMail({
    to: order.email,
    subject: `Blood test report ready — ${detail.patient.name}`,
    text:
      `Dr. ${order.name},\n\nThe Predict blood test report for ${detail.patient.name} (${detail.patient.code}) is ready.\n\n` +
      `Open the patient's record to read the results and biological age, and give them access to their dashboard:\n${link}\n\n— Predict`,
  });
  return { sent: result.ok, reason: result.error };
}
