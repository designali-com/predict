import { db } from "@workspace/db/client";
import { communicationMessage } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { nextClinicSlot, type ClockSlot } from "../lib/clinic-clock";
import { sendCommunicationExecutor } from "./send-communication";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

/**
 * One message of a lead nurture, paced by how the lead took the last one.
 *
 * Sends its template, then holds the run on itself and looks at what became
 * of the message before letting the next one go:
 *
 *   read            the next message goes at the next slot — tomorrow
 *   not read yet    one day's rest first
 *   refused by Meta the same template once more, a day later — the
 *                   frequency cap (131049) is per person and eases with time,
 *                   so moving on would only waste the next message as well
 *
 * Marketing messages two days running to someone who is not reading them is
 * what Meta caps; someone who reads them is capped far less. A reply, a
 * booking or a change of lead status ends the nurture before any of this —
 * the engine asks lead-nurture-guard before every step.
 *
 * Its state lives in the run's context under nurture[nodeId].
 */

interface NurtureStepConfig {
  templateKey: string;
  /** Clinic clock times the NEXT message may go at — alternate mornings and evenings. */
  nextSlot: ClockSlot[];
  /** Sends of this template before moving on regardless. Default 2: the first and one retry. */
  maxAttempts?: number;
  /** Spread over this many minutes after the slot, so the leads do not all go in one minute. Default 40. */
  spreadMinutes?: number;
}

interface StepState {
  messageId: string | null;
  attempts: number;
  phase: "sent" | "rest" | "retry";
}

const HOUR = 3_600_000;

/** The next slot at least `gapMs` away, plus a spread so a batch does not land at once. */
function nextSend(config: NurtureStepConfig, gapMs: number): Date {
  const slot = nextClinicSlot(new Date(Date.now() + gapMs), config.nextSlot);
  const spread = Math.max(0, config.spreadMinutes ?? 40);
  return new Date(slot.getTime() + Math.floor(Math.random() * spread) * 60_000);
}

async function statusOf(messageId: string | null): Promise<string | null> {
  if (!messageId) return null;
  const [row] = await db
    .select({ status: communicationMessage.status })
    .from(communicationMessage)
    .where(eq(communicationMessage.id, messageId))
    .limit(1);
  return row?.status ?? null;
}

function withState(context: RunContext, nodeId: string, state: StepState | null): RunContext {
  const all = { ...((context.nurture as Record<string, StepState>) ?? {}) };
  if (state) all[nodeId] = state;
  else delete all[nodeId];
  return { nurture: all };
}

export const nurtureStepExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as NurtureStepConfig;
    if (!config?.templateKey) throw new Error("Nurture step: templateKey is required");
    if (!Array.isArray(config.nextSlot) || config.nextSlot.length === 0) throw new Error("Nurture step: nextSlot is required");
    const maxAttempts = Math.max(1, config.maxAttempts ?? 2);
    const state = (context.nurture as Record<string, StepState> | undefined)?.[node.id];

    // Send — the first time, or the retry after Meta refused it.
    if (!state || state.phase === "retry") {
      const sent = await sendCommunicationExecutor.execute(
        { ...node, type: "sendCommunication", data: { ...node.data, config: { templateKey: config.templateKey } } },
        context,
      );
      // Held for quiet hours: stay here, nothing sent yet, nothing to record.
      if (sent.suspend) return sent;
      const out = sent.output as { status?: string; messageId?: string; skipped?: boolean };
      if (out.skipped) return { output: { ...out, outcome: "skipped" }, contextPatch: withState(context, node.id, null) };

      const attempts = (state?.attempts ?? 0) + 1;
      const next: StepState = { messageId: out.messageId ?? null, attempts, phase: "sent" };
      // Look again at the next slot, at least half a day on — by then a read or a refusal is known.
      return {
        output: { ...out, attempt: attempts },
        contextPatch: withState(context, node.id, next),
        suspend: { kind: "delay", resumeAt: nextSend(config, 12 * HOUR), stay: true },
      };
    }

    // Rested a day after an unread message: move on.
    if (state.phase === "rest") {
      return { output: { outcome: "moved on after a rest day" }, contextPatch: withState(context, node.id, null) };
    }

    // phase "sent": decide from what became of the message.
    const status = await statusOf(state.messageId);
    if (status === "read") {
      return { output: { outcome: "read — next message now", status }, contextPatch: withState(context, node.id, null) };
    }
    if (status === "failed") {
      if (state.attempts < maxAttempts) {
        return {
          output: { outcome: "refused — same template again tomorrow", status, attempt: state.attempts },
          contextPatch: withState(context, node.id, { ...state, phase: "retry" }),
          suspend: { kind: "delay", resumeAt: nextSend(config, 20 * HOUR), stay: true },
        };
      }
      return { output: { outcome: "refused again — moving on", status }, contextPatch: withState(context, node.id, null) };
    }
    return {
      output: { outcome: "not read yet — a day's rest", status },
      contextPatch: withState(context, node.id, { ...state, phase: "rest" }),
      suspend: { kind: "delay", resumeAt: nextSend(config, 20 * HOUR), stay: true },
    };
  },
};
