/**
 * Which of the two very different things a quote CONFLICT is.
 *
 * The customer sees one message either way, and should: "we cannot sell you this week" is the
 * whole of what they can act on. An operator needs the other half. A vendor declining a week
 * is ordinary and self-correcting — the refusal is recorded and the card moves off it. An
 * adapter that errored or timed out is our own failure wearing the vendor's answer, and it
 * does not self-correct: only what a vendor actually refused is written down, so nothing
 * changes and every retry fails the same way.
 *
 * That distinction was invisible, and it cost a listing. A NauSYS obligatory extra typed
 * INCLUDED_IN_PRICE threw out of the quote mapper, which read as an errored offer, no winner,
 * and a flat CONFLICT on every date — while `freeYachts` was returning the yacht FREE and
 * priced. Nothing logged it on either side, and the detail page seeds its first quote without
 * reporting failures, so the only trace anywhere was an empty sidebar.
 */
export type RefusalAttempt =
  | { outcome: "priced"; providerCode: string }
  | {
      outcome: "ineligible" | "unavailable" | "error" | "timeout";
      providerCode: string;
      reason: string;
    };

export type RefusalReport = {
  /** `ours` when any vendor was asked and we failed to read its answer. */
  blame: "ours" | "vendor";
  /** Every vendor asked and what it said, in one line. */
  said: string;
};

export function classifyRefusal(attempts: readonly RefusalAttempt[]): RefusalReport {
  const said =
    attempts
      .map((attempt) =>
        attempt.outcome === "priced"
          ? `${attempt.providerCode}:priced`
          : `${attempt.providerCode}:${attempt.outcome}(${attempt.reason})`,
      )
      .join(", ") || "no offer answered";

  const ours = attempts.some(
    (attempt) => attempt.outcome === "error" || attempt.outcome === "timeout",
  );

  return { blame: ours ? "ours" : "vendor", said };
}
