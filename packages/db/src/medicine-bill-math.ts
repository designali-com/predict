// Medicine bill sums — client-safe, no database. The sell form and the server
// both use these, so the total shown is always the total charged.

export type DiscountType = "percent" | "amount";

export interface MedicineSaleLine {
  medicineId: string;
  quantity: number;
  rateInPaise: number;
  /** A percentage off the line, or rupees off the line. None if absent. */
  discountType?: DiscountType | null;
  /** 0–100 for percent; rupees for amount. */
  discountValue?: number | null;
}

/**
 * What one line comes to. Shared by the form (to show the total as it is
 * typed) and the server (to charge it), so the two can never disagree.
 */
export function lineAmounts(line: Pick<MedicineSaleLine, "quantity" | "rateInPaise" | "discountType" | "discountValue">) {
  const grossInPaise = Math.max(0, Math.round(line.rateInPaise * line.quantity));
  const value = Number(line.discountValue ?? 0);
  let discountInPaise = 0;
  if (line.discountType === "percent" && value > 0) discountInPaise = Math.round((grossInPaise * Math.min(value, 100)) / 100);
  if (line.discountType === "amount" && value > 0) discountInPaise = Math.min(grossInPaise, Math.round(value * 100));
  return { grossInPaise, discountInPaise, amountInPaise: grossInPaise - discountInPaise };
}
