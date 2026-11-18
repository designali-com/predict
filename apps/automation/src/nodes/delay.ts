import { nextClinicSlot, type ClockSlot } from "../lib/clinic-clock";
import type { FlowNode, NodeExecutor } from "./types";

interface DelayConfig {
  durationMs?: number;
  /** When set, wait until the next of these clinic clock times instead of a fixed number of minutes. */
  nextSlot?: ClockSlot[];
  /**
   * With nextSlot: the slot must also be at least this far away. A message that
   * went out at 9:30 (held by quiet hours) must not be followed by the "next
   * 10:00" half an hour later — two marketing messages that close together is
   * what Meta blocks with 131049.
   */
  minGapMs?: number;
}

// Suspends the run; the worker schedules a BullMQ delayed job for
// resumeAt (primary resume mechanism) — see engine.ts / worker.ts. The
// reconciliation sweep is only a backup for a lost job, not how this
// normally resumes.
export const delayExecutor: NodeExecutor = {
  async execute(node: FlowNode) {
    const config = node.data.config as DelayConfig;
    const slots = Array.isArray(config.nextSlot) ? config.nextSlot : [];
    const resumeAt = slots.length
      ? nextClinicSlot(new Date(Date.now() + Math.max(0, config.minGapMs ?? 0)), slots)
      : new Date(Date.now() + (config.durationMs ?? 0));
    return { output: { resumeAt: resumeAt.toISOString() }, suspend: { kind: "delay", resumeAt } };
  },
};
