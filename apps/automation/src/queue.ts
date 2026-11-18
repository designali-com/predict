import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type FlowJob =
  | {
      kind: "start";
      flowId: string;
      lifecycleEventId?: string;
      contactId?: string;
      triggerExecutionId?: string;
      initialContext: Record<string, unknown>;
    }
  | { kind: "resume"; runId: string }
  | { kind: "reply"; runId: string; branchKey: string; replyContext?: Record<string, unknown> }
  // A stage message (Stage Messages page) due now — see ./stage-messages.ts.
  | { kind: "stage-message"; sendId: string };

/**
 * The demo has no Redis and no worker: a job is acknowledged and dropped, so
 * an action that would schedule one (testing a flow, a stage message) still
 * answers instead of hanging on a connection that will never open.
 */
const demoQueue = {
  add: async (name: string) => ({ id: `demo-${name}-${Date.now().toString(36)}` }),
  getJob: async () => null,
  remove: async () => 0,
  close: async () => undefined,
} as unknown as Queue<FlowJob>;

export const flowQueue: Queue<FlowJob> =
  process.env.DEMO_MODE !== "0"
    ? demoQueue
    : new Queue<FlowJob>("automation-flow", { connection: redisConnection });
