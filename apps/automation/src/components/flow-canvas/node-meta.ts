import {
  Zap,
  GitBranch,
  Clock,
  MessageCircle,
  Database,
  Variable,
  Gauge,
  Globe,
  Webhook,
  Sparkles,
  Repeat,
  MessageSquareReply,
  CalendarClock,
  ListTodo,
  UserSearch,
  Send,
  CalendarDays,
  CalendarCheck,
  Megaphone,
  type LucideIcon,
} from "lucide-react"

export type NodeKind =
  | "trigger"
  | "condition"
  | "delay"
  | "waitForReply"
  | "waitForEvent"
  | "createTask"
  | "loadContact"
  | "sendCommunication"
  | "databaseUpdate"
  | "variable"
  | "score"
  | "apiCall"
  | "webhook"
  | "ai"
  | "loop"
  | "emitEvent"
  | "sendAvailableDates"
  | "sendAvailableTimeSlots"
  | "bookAppointment"
  | "sendText"
  | "loadVisit"
  | "waitUntilVisit"
  | "nurtureStep"

export interface NodeMeta {
  kind: NodeKind
  label: string
  /** Short one-liner shown on the node card and palette. */
  description: string
  /** Longer explanation shown in the config panel — what this node
   * actually reads/writes, which table, and when to use it. This is the
   * "what does this button do" answer, not marketing copy. */
  details: string
  icon: LucideIcon
  color: string // tailwind text/border color token
  addable: boolean // false for trigger — it's created once, not from the palette
}

export const NODE_META: Record<NodeKind, NodeMeta> = {
  trigger: {
    kind: "trigger",
    label: "Trigger",
    description: "WHEN this happens",
    details:
      "The starting point of the automation — chosen once at the top of the builder (the dropdown next to the automation name), not configured here. Every contact this flow runs for got here because this exact event fired for them (e.g. LEAD_CAPTURED, APPOINTMENT_CREATED). Whatever data that event carried — always including contactId — is what every later node's \"context\" starts with.",
    icon: Zap,
    color: "#7c3aed",
    addable: false,
  },
  condition: {
    kind: "condition",
    label: "Check",
    description: "IF / ELSE branch",
    details:
      "Reads a value out of the run's in-memory context (not the database — see \"Load Contact\" if you need a fresh value) at the dot-path you give it, e.g. contact.stage or biologicalAge.delta, and compares it. Connect the green \"Yes\" dot and red \"No\" dot to two different next steps. Nothing is read from or written to any table.",
    icon: GitBranch,
    color: "#2563eb",
    addable: true,
  },
  delay: {
    kind: "delay",
    label: "Wait",
    description: "Pause for a fixed time, or until the next clinic clock time",
    details:
      "Pauses the run, then always continues to whatever single node is connected next — no branching. A fixed duration is for \"2 hours later\". A list of clock times waits until the next one of those times (clinic clock, IST) and then repeats the list. The run sits in automation_flow_run with status \"waiting\" until the time is up.",
    icon: Clock,
    color: "#d97706",
    addable: true,
  },
  waitForReply: {
    kind: "waitForReply",
    label: "Wait for Reply",
    description: "Pause until the contact replies on WhatsApp",
    details:
      "Pauses until the contact taps a button or sends a free-text reply on WhatsApp — not a timer. Use \"Import from template\" in this panel to pull in the exact buttons from a template you're sending earlier in the flow, so you don't have to retype button text by hand. Each imported button becomes its own dot on the node to connect a different next step to. \"Any other reply\" catches free text; \"Timed out\" (only shown if you set a timeout) catches silence. Reads inbound WhatsApp messages logged by the webhook into communication_message — writes nothing itself.",
    icon: MessageSquareReply,
    color: "#db2777",
    addable: true,
  },
  waitForEvent: {
    kind: "waitForEvent",
    label: "Wait for Event",
    description: "Pause until something happens elsewhere in the system",
    details:
      "Pauses until a specific event fires for this same contact anywhere in the system — e.g. wait up to 7 days for APPOINTMENT_CREATED before deciding a lead didn't re-engage. Unlike Wait for Reply, this isn't about a WhatsApp message — it fires from any action that emits that event (booking an appointment, a status change, a report upload, etc). \"Event happened\" and \"Timed out\" are the two dots to connect.",
    icon: CalendarClock,
    color: "#9333ea",
    addable: true,
  },
  createTask: {
    kind: "createTask",
    label: "Create Task",
    description: "Assign a to-do to staff — the step automation can't do itself",
    details:
      "Inserts one row into the task table (title, assigned role, due date, linked to this contact) — that's it, no message is sent. It shows up on the staff member's Tasks page for them to act on and mark done by hand. Use this for anything that needs a human — \"Health Coach direct call\", \"Doctor review Day 21\".",
    icon: ListTodo,
    color: "#0369a1",
    addable: true,
  },
  loadContact: {
    kind: "loadContact",
    label: "Load Contact",
    description: "Re-fetch this contact's current row from the database",
    details:
      "Runs a fresh SELECT on the contact table for this contact (status, name, phone, email, source, score) and puts the result under context.contact — e.g. context.contact.stage. Use this right before a Check node whenever you need the contact's CURRENT state rather than whatever was true back when the flow started. Classic use: before sending a Day-3/Day-5 nudge, Load Contact then Check contact.stage == \"LEAD\" — if they already converted, the flow stops instead of sending another message. Writes nothing.",
    icon: UserSearch,
    color: "#525252",
    addable: true,
  },
  sendCommunication: {
    kind: "sendCommunication",
    label: "Send Message",
    description: "Send a WhatsApp or Email template to this contact",
    details:
      "Sends the template you pick (from the Templates page) to this contact's phone/email, checking their consent preferences first. Every send — successful, failed, or skipped for no consent — is logged as a row in communication_message. Reads the contact's phone/email from the contact table to know where to send it.",
    icon: MessageCircle,
    color: "#16a34a",
    addable: true,
  },
  databaseUpdate: {
    kind: "databaseUpdate",
    label: "Update Record",
    description: "Write back to the contact — from a fixed, safe list of operations",
    details:
      "Deliberately NOT a generic \"run any SQL\" node — flow authors pick one of a fixed allow-listed operation, never a raw table/column. \"Set contact stage\" writes contact.stage and also emits a CONTACT_STAGE_CHANGED event (so a separate flow can react to it). \"Log adherence entry\" inserts a row into adherence_log (medication/exercise/diet compliance). Clinical tables (biomarkers, biological age results) are intentionally never reachable from here — automation only ever reads those via events, never writes to them.",
    icon: Database,
    color: "#4f46e5",
    addable: true,
  },
  variable: {
    kind: "variable",
    label: "Set Variable",
    description: "Store a computed value in context for a later node to use",
    details:
      "Writes a value into the run's in-memory context under a name you choose — nothing touches the database. Useful for carrying a computed value (e.g. from an API Call's response) forward to a later Check or Send Message node in the same run.",
    icon: Variable,
    color: "#0891b2",
    addable: true,
  },
  score: {
    kind: "score",
    label: "Score",
    description: "Copy a numeric context value under a new name, for branching on later",
    details:
      "Reads a numeric field already in context and stores it under a new name — the extension point for real weighted-scoring logic once the business defines it; today it's a pass-through. Doesn't touch the database.",
    icon: Gauge,
    color: "#65a30d",
    addable: true,
  },
  apiCall: {
    kind: "apiCall",
    label: "API Call",
    description: "Fetch or push data to an external system",
    details:
      "Makes an HTTP request to a URL you provide (GET/POST/etc), optionally sending the run's context as the request body, and can store the response back into context under a key you choose for later nodes to read. Nothing in our own database is touched directly by this node.",
    icon: Globe,
    color: "#0d9488",
    addable: true,
  },
  webhook: {
    kind: "webhook",
    label: "Webhook",
    description: "Fire-and-forget notification to an external URL",
    details:
      "POSTs the run's current context to a URL as a one-way notification (e.g. alert an external system something happened) — doesn't wait for or store a meaningful response, unlike API Call.",
    icon: Webhook,
    color: "#78716c",
    addable: true,
  },
  ai: {
    kind: "ai",
    label: "AI",
    description: "Answer the person, sort their reply into branches, or write text for a later step",
    details:
      "Uses the clinic information and safety rules from Setup → AI replies — this step adds an instruction, it cannot change what the assistant may claim. Answer: replies on WhatsApp and branches into answered / needs a person (the daily limit and the 'a human replied recently' pause still apply). Sort the reply: reads their last message and takes one of the branches you name, or 'Not clear'. Write text: puts the text into the run's context for a later Send Text node.",
    icon: Sparkles,
    color: "#c026d3",
    addable: true,
  },
  loop: {
    kind: "loop",
    label: "Loop",
    description: "Pull a list from context (doesn't yet repeat a sub-flow per item)",
    details:
      "Partial implementation: reads an array already in context and makes it available under a new name. It does NOT yet re-run a connected chain of nodes once per item — that needs a bigger engine change. Today, a flow using Loop gets a single pass through its next node, not one pass per item.",
    icon: Repeat,
    color: "#ea580c",
    addable: true,
  },
  emitEvent: {
    kind: "emitEvent",
    label: "Emit Event",
    description: "Hand off to a separate flow, decoupled",
    details:
      "Writes a row into domain_event with the type you pick, carrying the run's contactId and whatever else is in context — then this branch of the flow ends. Any OTHER flow whose trigger is that same event type starts its own independent run right after. Use this instead of building a giant single flow: e.g. the Nurture flow's \"Schedule an appointment\" branch emits APPOINTMENT_REQUESTED and stops, and a completely separate \"Appointment Booking\" flow (triggered on APPOINTMENT_REQUESTED) does the actual date/time/booking work — which also means staff, the website, or a reminder flow can trigger that same booking flow later without touching this node at all.",
    icon: Send,
    color: "#0f766e",
    addable: true,
  },
  sendAvailableDates: {
    kind: "sendAvailableDates",
    label: "Send Available Dates",
    description: "WhatsApp list of open dates, computed live",
    details:
      "Reads doctor_slot_template (which weekdays/time-ranges this doctor takes) plus a live count of existing appointment rows, works out which of the next few days still have an open slot, and sends those as a WhatsApp list message — not a template, since the options are different every time this runs. Puts the chosen doctorUserId into context for the two nodes after it. \"Available\" branch continues to Wait for Reply; \"No availability\" branch is for a fallback (e.g. Create Task: staff calls to book manually).",
    icon: CalendarDays,
    color: "#1d4ed8",
    addable: true,
  },
  sendAvailableTimeSlots: {
    kind: "sendAvailableTimeSlots",
    label: "Send Available Time Slots",
    description: "WhatsApp list of open time ranges for the picked date",
    details:
      "Reads context.selectedDate (set by the Wait for Reply node right before this one) and context.doctorUserId (set earlier by Send Available Dates), counts existing appointment rows against that day's doctor_slot_template capacity, and sends only the ranges still open. Used twice in a typical graph: once on the normal path, and again as the loop-back target from Book Appointment's \"Full\" branch, so a patient who just missed out sees a fresh list instead of a dead end.",
    icon: CalendarDays,
    color: "#1d4ed8",
    addable: true,
  },
  bookAppointment: {
    kind: "bookAppointment",
    label: "Book Appointment",
    description: "Race-safe final booking — this is where LEAD becomes PATIENT",
    details:
      "Reads context.selectedDate/selectedSlot/doctorUserId, then re-checks capacity for real inside a locked database transaction (an advisory lock keyed on doctor+date+slot, so two patients tapping the same slot within milliseconds of each other can't both get in) before inserting into the appointment table. Only on a successful insert does contact.stage flip from LEAD to PATIENT (with CONTACT_STAGE_CHANGED emitted) — picking a date or a time slot does NOT convert the lead, only a completed booking does. \"Booked\" branch continues to a confirmation message; \"Full\" branch should loop back to Send Available Time Slots.",
    icon: CalendarCheck,
    color: "#15803d",
    addable: true,
  },
  loadVisit: {
    kind: "loadVisit",
    label: "Load Visit",
    description: "Read the booked appointment onto this run",
    details:
      "Looks up the appointment on this run (context.appointmentId) and copies its doctor and status into the run. Booking events are not all shaped the same — some only carry the appointment id — so a doctor check after this step sees the doctor who is actually on the visit. Also remembers when the run started, which the visit-wait step uses to mean \"the day after booking\". Writes nothing.",
    icon: CalendarDays,
    color: "#1d4ed8",
    addable: true,
  },
  waitUntilVisit: {
    kind: "waitUntilVisit",
    label: "Wait for Visit",
    description: "Pause until a time relative to the appointment",
    details:
      "Reads the appointment again and waits until 10:00 the day after booking, 10:00 on a day in the gap, 10:00 the day before, or 09:00 the morning of the visit (clinic time). \"Send\" continues; \"Skip\" is taken when the visit is too soon for that message, already started, or cancelled — connect Skip to the next wait so the rest of the sequence still runs. While it waits it stays on this step, so a reschedule is picked up when the timer fires.",
    icon: CalendarClock,
    color: "#b45309",
    addable: true,
  },
  nurtureStep: {
    kind: "nurtureStep",
    label: "Nurture Message",
    description: "A nurture message, paced by whether the last one was read",
    details:
      "Sends its template, then waits on itself and looks at what became of the message before the next step runs: read — the next message goes at the next slot (tomorrow); not read yet — a day's rest first; refused by Meta (e.g. the 131049 frequency cap) — the same template is sent once more a day later, then it moves on. The next message goes at the clock time picked here, spread over 40 minutes so a batch of leads does not land in one minute. A reply, a booking or a change of lead status ends the nurture before any send.",
    icon: Megaphone,
    color: "#7c3aed",
    addable: true,
  },
  sendText: {
    kind: "sendText",
    label: "Send Text",
    description: "Free-form WhatsApp text, not a template",
    details:
      "Sends plain text (with optional {{variableName}} interpolation from context) directly — not a WABA template, so it's only valid as a reply within the contact's active 24h session (right after they messaged/tapped something), which is exactly the situation right after Book Appointment. Logs to communication_message like any other send. Use Send Message (the template-based node) instead for anything that needs to reach someone outside an active session.",
    icon: MessageCircle,
    color: "#0891b2",
    addable: true,
  },
}

export const ADDABLE_NODE_KINDS = (Object.keys(NODE_META) as NodeKind[]).filter(
  (k) => NODE_META[k].addable,
)
