/**
 * What the day's queue is called, for the person reading it.
 *
 * Its own module, with no "use client", because both sides need it: the panel
 * heading is chosen in a server component and the empty state inside the panel
 * is chosen in a client one. Exported from the client file, a server component
 * calling it is a runtime error.
 *
 * The rows themselves were always right — each role only ever saw its own
 * stages — but the panel was headed "Waiting at the front desk" on every
 * screen, so a doctor was told that the list of patients paid, registered and
 * ready for him was somebody else's queue.
 */
export const QUEUE_TITLE: Record<string, string> = {
  receptionist: "Waiting at the front desk",
  doctor: "Ready to be seen",
  nutritionist: "Waiting for the nutritionist",
};

export const QUEUE_HINT: Record<string, string> = {
  receptionist: "Registration, fees and plan payments due today appear here.",
  doctor: "Patients appear here once the fee is paid and page 1 of FORM-I is in.",
  nutritionist: "Patients appear here once the doctor has prescribed a package.",
};

export function queueTitle(role: string | null | undefined): string {
  return QUEUE_TITLE[role ?? ""] ?? "Waiting on the clinic";
}

export function queueHint(role: string | null | undefined): string {
  return (
    QUEUE_HINT[role ?? ""] ?? "Whatever is waiting on you today appears here as it happens."
  );
}
