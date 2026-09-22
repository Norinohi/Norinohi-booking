import type { ProviderInvoice } from "@yacht-charter/providers";

/** Commission lines on a NauSYS agency invoice: `AG-COMM-1`, and its numbered siblings. */
const COMMISSION_LINE = /^AG-COMM/;

export interface HeldBooking {
  id: string;
  reference: string;
  commissionMinor: number | null;
  currency: string | null;
}

export interface CommissionMismatch {
  reference: string;
  invoiced: number;
  quoted: number;
  currency: string;
}

/**
 * The commission lines invoiced against the commission quoted, where both are stated in the
 * same money. Another currency is not a mismatch: the vendor invoices in the agency's currency,
 * and converting to compare would report the exchange rate.
 */
export function commissionMismatchOf(
  invoice: ProviderInvoice,
  held: HeldBooking,
): CommissionMismatch | null {
  const lines = invoice.lines.filter((line) => COMMISSION_LINE.test(line.code));
  if (lines.length === 0 || held.commissionMinor === null || held.currency !== invoice.currency) {
    return null;
  }
  const invoiced = lines.reduce((sum, line) => sum + line.netMinor, 0);
  if (invoiced === held.commissionMinor) return null;
  return {
    reference: held.reference,
    invoiced,
    quoted: held.commissionMinor,
    currency: invoice.currency,
  };
}
