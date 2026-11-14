// Expense categories and labels — client-safe, no database.
//
// A fixed list rather than free text: "Rent", "rent", "Office rent" would be
// three rows in the month's breakdown. A thing that fits nowhere goes under
// Miscellaneous with a note, and if the same note keeps coming back it earns
// its own category here.

export const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "salary", label: "Salaries" },
  { value: "utilities", label: "Electricity, water & internet" },
  { value: "medicine", label: "Medicine & stock purchase" },
  { value: "consumables", label: "Consumables" },
  { value: "marketing", label: "Marketing & ads" },
  { value: "maintenance", label: "Repair & maintenance" },
  { value: "travel", label: "Travel & courier" },
  { value: "misc", label: "Miscellaneous" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label]),
);

/** What each category is for, shown under the picker. */
export const EXPENSE_CATEGORY_HINT: Record<string, string> = {
  rent: "Clinic premises, parking",
  salary: "Staff pay, incentives, advances",
  utilities: "Electricity, water, internet, phone bills",
  medicine: "BHT, JP, Proflex and other stock bought in",
  consumables: "Cotton, gel, gloves, stationery, cleaning",
  marketing: "Meta / Google ads, printing, banners",
  maintenance: "Machine service, AC, plumbing, electrician",
  travel: "Cab, petrol, courier, delivery",
  misc: "Anything else — say what in the note",
};

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((c) => c.value === v);
}

/** The permission that shows every expense, the profit, voiding and repeats. */
export const EXPENSES_ALL = "clinic.expenses_all";

/** How cash left the drawer for the clinic's bank account. */
export const CASH_DEPOSIT_VIA = [
  { value: "bank", label: "Deposited at the bank" },
  { value: "person", label: "Given to a person, who transferred it" },
] as const;

export type CashDepositVia = (typeof CASH_DEPOSIT_VIA)[number]["value"];

export const CASH_DEPOSIT_VIA_LABEL: Record<string, string> = Object.fromEntries(
  CASH_DEPOSIT_VIA.map((v) => [v.value, v.label]),
);

export function isCashDepositVia(v: unknown): v is CashDepositVia {
  return CASH_DEPOSIT_VIA.some((c) => c.value === v);
}
