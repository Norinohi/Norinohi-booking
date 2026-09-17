import { DEFAULT_LINE_LABELS } from "@yacht-charter/providers/shared/generic-labels";

/**
 * Price line names this app writes, as opposed to what a vendor or an operator named a line.
 *
 * Stored quote lines carry an English `label`, and for these lines the English is ours: the
 * adapters' placeholder when a vendor sent no name, and the referral lines the quote adds. A
 * screen translates those and prints every other label exactly as it came.
 *
 * Exported from here rather than from `providers` so the web app can recognise a placeholder
 * without depending on the adapters.
 */
export type OwnLineLabel =
  | "charterPrice"
  | "charterExtra"
  | "charterDiscount"
  | "referralWelcome"
  | "referralCredit";

const BY_CODE = new Map<string, OwnLineLabel>([
  ["referral-welcome", "referralWelcome"],
  ["referral-credit", "referralCredit"],
]);

const BY_PLACEHOLDER = new Map<string, OwnLineLabel>([
  [DEFAULT_LINE_LABELS.base, "charterPrice"],
  [DEFAULT_LINE_LABELS.extra, "charterExtra"],
  [DEFAULT_LINE_LABELS.discount, "charterDiscount"],
]);

export function ownLineLabel(line: { code: string; label: string }): OwnLineLabel | null {
  return BY_CODE.get(line.code) ?? BY_PLACEHOLDER.get(line.label.trim()) ?? null;
}
