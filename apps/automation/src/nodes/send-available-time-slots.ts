import { sendInteractiveListMessage } from "@workspace/communication";
import { clinicOfContact, getAvailableTimeSlots } from "../lib/scheduling";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

/** Row id of a "Later / Earlier times" row: this prefix plus the slot offset to show. */
export const MORE_PREFIX = "more:";
/** WhatsApp's cap on rows in one list message. */
const PAGE = 10;

interface SendAvailableTimeSlotsConfig {
  dateFromContext?: string; // default "selectedDate"
  doctorFromContext?: string; // default "doctorUserId"
  bodyText?: string;
}

// Reads the date the patient already picked (context.selectedDate, set by
// the Wait for Reply node right before this one via captureReplyAs) and
// doctorUserId (set by Send Available Dates earlier in this same flow), then
// sends the open time ranges for that specific date — also computed live,
// also not a template. Used twice in the flow: once on the normal path, and
// again as the loop-back target when Book Appointment finds a slot just
// filled (its "full" branch points back here for a fresh list).
export const sendAvailableTimeSlotsExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as SendAvailableTimeSlotsConfig;
    const dateKey = config.dateFromContext || "selectedDate";
    const doctorKey = config.doctorFromContext || "doctorUserId";

    const contactId = context.contactId;
    const date = context[dateKey];
    const doctorUserId = context[doctorKey];
    if (typeof contactId !== "string") {
      throw new Error("Send Available Time Slots node: no contactId in run context");
    }
    if (typeof date !== "string") {
      throw new Error(`Send Available Time Slots node: no date found at context.${dateKey}`);
    }
    if (typeof doctorUserId !== "string") {
      throw new Error(`Send Available Time Slots node: no doctor found at context.${doctorKey}`);
    }

    const slots = await getAvailableTimeSlots(doctorUserId, date, await clinicOfContact(contactId));

    if (slots.length === 0) {
      return { output: { available: false } };
    }

    // WhatsApp shows at most 10 rows in a list, and a working day is often
    // more slots than that (10am–6pm at 30 minutes is 16), so the day is sent
    // a page at a time. The last row of a page is "Later times" (id
    // MORE_PREFIX + offset); Book Appointment sees it, books nothing and
    // loops back here with slotOffset moved on.
    let offset = typeof context.slotOffset === "number" ? context.slotOffset : 0;
    if (offset >= slots.length) offset = 0;
    const rest = slots.slice(offset);
    const options: { id: string; title: string }[] = [];
    if (offset > 0) options.push({ id: `${MORE_PREFIX}${Math.max(0, offset - (PAGE - 1))}`, title: "← Earlier times" });
    const room = PAGE - options.length;
    const fitsAll = rest.length <= room;
    const shown = fitsAll ? rest : rest.slice(0, room - 1);
    options.push(...shown.map((s) => ({ id: s.slot, title: s.label })));
    if (!fitsAll) options.push({ id: `${MORE_PREFIX}${offset + shown.length}`, title: "Later times →" });

    const result = await sendInteractiveListMessage({
      contactId,
      runId: typeof context.runId === "string" ? context.runId : undefined,
      bodyText: config.bodyText || "Please pick a time:",
      buttonLabel: "Pick a time",
      options,
    });

    return { output: { available: true, ...result, slots }, contextPatch: { slotOffset: offset } };
  },
};
