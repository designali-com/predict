import { sendInteractiveListMessage } from "@workspace/communication";
import { clinicOfContact, getAvailableDates, pickLeastLoadedClinician } from "../lib/scheduling";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface SendAvailableDatesConfig {
  doctorUserId?: string;
  /** Share each new booking across everyone with this role, half and half. */
  balanceRole?: "nutritionist";
  daysAhead?: number;
  maxDates?: number;
  bodyText?: string;
}

// Queries doctor_slot_template + appointment (via getAvailableDates) for the
// next open dates and sends them as a WhatsApp list message — not a
// template, since the options are different every time this runs. Puts
// doctorUserId into context so the two nodes after it (Send Available Time
// Slots, Book Appointment) don't need the doctor picked again.
export const sendAvailableDatesExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as SendAvailableDatesConfig;
    const contactId = context.contactId;
    if (typeof contactId !== "string") {
      throw new Error("Send Available Dates node: no contactId in run context");
    }

    const window = { daysAhead: config.daysAhead, maxDates: config.maxDates, clinicId: await clinicOfContact(contactId) };
    let doctorUserId = config.doctorUserId;
    let nutritionistName: string | undefined;
    if (config.balanceRole === "nutritionist") {
      const picked = await pickLeastLoadedClinician("nutritionist", window);
      if (!picked) {
        return { output: { available: false, balanced: true }, contextPatch: { doctorUserId: config.doctorUserId } };
      }
      doctorUserId = picked.id;
      nutritionistName = picked.name;
    }
    if (!doctorUserId) throw new Error("Send Available Dates node: no doctor selected");

    const dates = await getAvailableDates(doctorUserId, window);

    if (dates.length === 0) {
      // No open dates in the lookahead window — connect the "No availability"
      // branch to a fallback (e.g. Create Task: staff to call and book
      // manually), same idea as a Condition node's false branch.
      return { output: { available: false }, contextPatch: { doctorUserId, nutritionistName } };
    }

    const result = await sendInteractiveListMessage({
      contactId,
      runId: typeof context.runId === "string" ? context.runId : undefined,
      bodyText: config.bodyText || "Please pick a date for your appointment:",
      buttonLabel: "Pick a date",
      options: dates.map((d) => ({ id: d.date, title: d.label })),
    });

    return {
      output: { available: true, ...result, dates },
      contextPatch: { doctorUserId, nutritionistName },
    };
  },
};
