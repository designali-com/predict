import { notifyBookedVisit } from "@workspace/communication/visit-meet";
import { db } from "@workspace/db/client";
import { appointment, contact, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { bookSlot } from "../lib/scheduling";
import { MORE_PREFIX } from "./send-available-time-slots";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface BookAppointmentConfig {
  dateFromContext?: string; // default "selectedDate"
  slotFromContext?: string; // default "selectedSlot"
  doctorFromContext?: string; // default "doctorUserId"
  meetingLocation?: string; // e.g. "Online (video call)"
  channel?: "virtual" | "in_clinic";
}

function visitChannel(config: BookAppointmentConfig): "virtual" | "in_clinic" | undefined {
  if (config.channel === "virtual" || config.channel === "in_clinic") return config.channel;
  if (config.meetingLocation && /online|video|meet/i.test(config.meetingLocation)) return "virtual";
  return undefined;
}

// The one place appointment rows actually get created from this flow, and
// the one place LEAD -> PATIENT conversion happens for it (inside
// bookSlot(), atomically with the insert — see lib/scheduling.ts). Re-checks
// capacity for real inside a locked transaction rather than trusting the
// list the patient tapped a moment earlier, which can go stale between
// being sent and being answered. "Booked" branch continues to a
// confirmation message; "Full" branch should loop back to Send Available
// Time Slots so the patient sees a fresh list instead of a dead end.
export const bookAppointmentExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as BookAppointmentConfig;
    const dateKey = config.dateFromContext || "selectedDate";
    const slotKey = config.slotFromContext || "selectedSlot";
    const doctorKey = config.doctorFromContext || "doctorUserId";

    const contactId = context.contactId;
    const date = context[dateKey];
    const slot = context[slotKey];
    const doctorUserId = context[doctorKey];
    if (typeof contactId !== "string") throw new Error("Book Appointment node: no contactId in run context");
    if (typeof date !== "string") throw new Error(`Book Appointment node: no date found at context.${dateKey}`);
    if (typeof slot !== "string") throw new Error(`Book Appointment node: no slot found at context.${slotKey}`);
    if (typeof doctorUserId !== "string") {
      throw new Error(`Book Appointment node: no doctor found at context.${doctorKey}`);
    }

    // "Later times" / "Earlier times" on a paged slot list: nothing to book,
    // go back round the "full" branch to Send Available Time Slots, which
    // shows the page that row asked for.
    if (slot.startsWith(MORE_PREFIX)) {
      const slotOffset = Number(slot.slice(MORE_PREFIX.length)) || 0;
      return { output: { booked: false, reason: "asked for more times" }, contextPatch: { slotOffset } };
    }

    const channel = visitChannel(config);
    const result = await bookSlot({
      doctorUserId,
      contactId,
      date,
      slot,
      meetingLocation: config.meetingLocation || undefined,
      channel,
    });

    if (!result.booked || !result.appointmentId) {
      return {
        output: { booked: result.booked, appointmentId: result.appointmentId, reason: result.reason },
        contextPatch: {},
      };
    }

    const [host] = await db.select({ name: user.name }).from(user).where(eq(user.id, doctorUserId)).limit(1);
    let meetingLink = "The call link will show on your appointment page.";
    if (channel === "virtual") {
      const [row] = await db
        .select({
          clinicId: appointment.clinicId,
          scheduledAt: appointment.scheduledAt,
          meetingLocation: appointment.meetingLocation,
        })
        .from(appointment)
        .where(eq(appointment.id, result.appointmentId))
        .limit(1);
      const [person] = await db
        .select({ name: contact.name, email: contact.email })
        .from(contact)
        .where(eq(contact.id, contactId))
        .limit(1);
      if (row) {
        const location = await notifyBookedVisit({
          appointmentId: result.appointmentId,
          clinicId: row.clinicId,
          channel: "virtual",
          start: row.scheduledAt,
          meetingLocation: row.meetingLocation,
          attendeeName: person?.name?.trim() || "Patient",
          attendeeEmail: person?.email ?? null,
          doctorUserId,
        });
        if (location && /^https?:\/\//i.test(location)) meetingLink = `Join the call: ${location}`;
      }
    }

    return {
      output: { booked: true, appointmentId: result.appointmentId, reason: result.reason },
      contextPatch: {
        appointmentId: result.appointmentId,
        nutritionistName: host?.name ?? "",
        meetingLink,
      },
    };
  },
};
