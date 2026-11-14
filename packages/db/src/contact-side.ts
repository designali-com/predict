import { ContactStage, type ContactStage as Stage } from "./contact-stage";

// Which of the two working lists a person belongs to.
//
// The operations console kept everyone on one "People" screen with stage as a
// filter. That reads well and grants badly: a health coach chasing leads and
// a coordinator looking after patients under care are different jobs, and
// giving someone the second because they need the first hands them the
// clinical record of every patient in the building.
//
// The line is the one contact.stage already draws — has this person ever
// attended? Everything up to and including a booking that has not happened yet
// is acquisition work; from the first attended visit onward it is care.
//
// It is defined once, here, because the page, the API and the route guard all
// have to agree on it. If they disagreed, the list would show rows the guard
// would then refuse to open.

export const ContactSide = {
  LEADS: "leads",
  PATIENTS: "patients",
} as const;

export type ContactSide = (typeof ContactSide)[keyof typeof ContactSide];

export const CONTACT_SIDES: ContactSide[] = [ContactSide.LEADS, ContactSide.PATIENTS];

export const SIDE_STAGES: Record<ContactSide, Stage[]> = {
  // LOST sits here rather than nowhere: a disqualified lead is still the
  // lead desk's record of what happened, and it is the only list where
  // "why did this go nowhere" is a question anyone asks.
  leads: [ContactStage.LEAD, ContactStage.BOOKED, ContactStage.LOST],
  // INACTIVE is a patient who has gone quiet — reactivation is care work,
  // not acquisition, so it stays with the people who know their history.
  patients: [ContactStage.PATIENT, ContactStage.INACTIVE],
};

export const SIDE_META: Record<
  ContactSide,
  { label: string; route: string; permission: string; blurb: string }
> = {
  leads: {
    label: "Leads",
    route: "/leads",
    permission: "ops.leads",
    // No line under the Leads title.
    blurb: "",
  },
  patients: {
    label: "Patients",
    route: "/patients",
    permission: "ops.patients",
    // No line under the Patients title either.
    blurb: "",
  },
};

export function isContactSide(value: unknown): value is ContactSide {
  return value === ContactSide.LEADS || value === ContactSide.PATIENTS;
}

/** Which list a person shows up on, from the stage stored against them. */
export function sideForStage(stage: string): ContactSide {
  return (SIDE_STAGES.patients as string[]).includes(stage)
    ? ContactSide.PATIENTS
    : ContactSide.LEADS;
}

/** The permission that opens the list this person is on. */
export function permissionForStage(stage: string): string {
  return SIDE_META[sideForStage(stage)].permission;
}

/** The sides a permission holder may look at, in list order. */
export function sidesFor(held: Iterable<string>): ContactSide[] {
  const keys = new Set(held);
  return CONTACT_SIDES.filter((side) => keys.has(SIDE_META[side].permission));
}

/** Every stage those sides cover — what a query may return for this person. */
export function stagesForSides(sides: ContactSide[]): Stage[] {
  return sides.flatMap((side) => SIDE_STAGES[side]);
}
