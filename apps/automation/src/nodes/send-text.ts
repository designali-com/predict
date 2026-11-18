import { sendTextMessage } from "@workspace/communication";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface SendTextConfig {
  bodyText: string;
}

function interpolate(template: string, context: RunContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

// Free-form WhatsApp text, not a WABA template — only valid as a direct
// reply within the contact's active 24h session (e.g. a booking
// confirmation right after Book Appointment). Supports {{variableName}}
// interpolation from context, e.g. "See you {{selectedDate}} at
// {{selectedSlot}}".
export const sendTextExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as SendTextConfig;
    if (!config.bodyText) throw new Error("Send Text node: no message text configured");

    const contactId = context.contactId;
    if (typeof contactId !== "string") {
      throw new Error("Send Text node: no contactId in run context");
    }

    const result = await sendTextMessage({
      contactId,
      runId: typeof context.runId === "string" ? context.runId : undefined,
      body: interpolate(config.bodyText, context),
    });
    return { output: result };
  },
};
