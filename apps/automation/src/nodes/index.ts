import type { NodeExecutor } from "./types";
import { triggerExecutor } from "./trigger";
import { conditionExecutor } from "./condition";
import { delayExecutor } from "./delay";
import { waitForReplyExecutor } from "./wait-for-reply";
import { waitForEventExecutor } from "./wait-for-event";
import { createTaskExecutor } from "./create-task";
import { loadContactExecutor } from "./load-contact";
import { loopExecutor } from "./loop";
import { aiExecutor } from "./ai";
import { webhookExecutor } from "./webhook";
import { variableExecutor } from "./variable";
import { scoreExecutor } from "./score";
import { apiCallExecutor } from "./api-call";
import { databaseUpdateExecutor } from "./database-update";
import { sendCommunicationExecutor } from "./send-communication";
import { emitEventExecutor } from "./emit-event";
import { sendAvailableDatesExecutor } from "./send-available-dates";
import { sendAvailableTimeSlotsExecutor } from "./send-available-time-slots";
import { bookAppointmentExecutor } from "./book-appointment";
import { sendTextExecutor } from "./send-text";
import { loadVisitExecutor } from "./load-visit";
import { waitUntilVisitExecutor } from "./wait-until-visit";
import { nurtureStepExecutor } from "./nurture-step";

// New capability = a new module + one line here, not a schema change.
export const nodeRegistry: Record<string, NodeExecutor> = {
  trigger: triggerExecutor,
  condition: conditionExecutor,
  delay: delayExecutor,
  waitForReply: waitForReplyExecutor,
  waitForEvent: waitForEventExecutor,
  createTask: createTaskExecutor,
  loadContact: loadContactExecutor,
  loop: loopExecutor,
  ai: aiExecutor,
  webhook: webhookExecutor,
  variable: variableExecutor,
  score: scoreExecutor,
  apiCall: apiCallExecutor,
  databaseUpdate: databaseUpdateExecutor,
  sendCommunication: sendCommunicationExecutor,
  emitEvent: emitEventExecutor,
  sendAvailableDates: sendAvailableDatesExecutor,
  sendAvailableTimeSlots: sendAvailableTimeSlotsExecutor,
  bookAppointment: bookAppointmentExecutor,
  sendText: sendTextExecutor,
  loadVisit: loadVisitExecutor,
  waitUntilVisit: waitUntilVisitExecutor,
  nurtureStep: nurtureStepExecutor,
};

export type { FlowNode, FlowEdge, FlowGraph, RunContext } from "./types";
