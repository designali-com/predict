// The states and union territories a patient's address can be in.
//
// patient_address.country defaults to 'India' and there is no field asking
// otherwise, so this is the list. Typed free-hand it produces "UP", "U.P.",
// "Uttar Pradesh" and "uttar pradesh" as four different places — nothing can be
// counted by region, and a printed address comes out however it was typed.
//
// Current as of the 2019 reorganisation (Jammu and Kashmir and Ladakh became
// union territories) and the 2020 merger of Dadra and Nagar Haveli with Daman
// and Diu. If that changes, this file changes — the values are stored as text,
// so an old row keeps the name it was saved under.

export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const INDIAN_UNION_TERRITORIES = [
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

/** Everything, in one flat list — what a plain <select> needs. */
export const INDIAN_REGIONS = [...INDIAN_STATES, ...INDIAN_UNION_TERRITORIES];

/**
 * The same list, split for optgroups.
 *
 * Worth the split because the two halves are alphabetical separately: a flat
 * A–Z would put Chandigarh between Bihar and Chhattisgarh, and somebody
 * scanning for their state would scroll past union territories they are not
 * looking for.
 */
export const INDIAN_REGION_GROUPS: { label: string; options: string[] }[] = [
  { label: "States", options: INDIAN_STATES },
  { label: "Union territories", options: INDIAN_UNION_TERRITORIES },
];

export function isIndianRegion(value: unknown): boolean {
  return typeof value === "string" && INDIAN_REGIONS.includes(value);
}
