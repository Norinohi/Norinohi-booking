import type { ReferralHistoryRow } from "../types";

/** Whole days between an ISO timestamp and now, for `Referrals.history.daysAgo`. */
export function daysSince(iso: string): number {
  const elapsed = Date.now() - new Date(iso).getTime();
  return Math.max(Math.floor(elapsed / 86_400_000), 0);
}

/*
 * The ledger has three redemption states; the design only drew two chips, so
 * `void` borrows the muted outline treatment.
 */
const STATUS_VARIANT = {
  credited: "neutral",
  pending: "brand",
  void: "outline",
} as const;

export function referralStatusVariant(status: ReferralHistoryRow["status"]) {
  return STATUS_VARIANT[status];
}
