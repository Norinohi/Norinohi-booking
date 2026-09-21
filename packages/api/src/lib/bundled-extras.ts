/**
 * Requested extras once the bundles among them are counted only once.
 *
 * Booking Manager sells packs that contain other extras (`includedExtras`), and the contents can
 * be charged on the same quote already: company 225's optional Charter Pack at 250 EUR contains
 * Cleaning, which the offer bills as an obligatory 100. Adding the pack at its catalogue rate
 * charged that cleaning twice, and requesting both the pack and the bed linen inside it did the
 * same for the linen.
 *
 * So a pack adds only what is not paid for yet, and an extra a requested pack contains adds
 * nothing of its own. A pack whose contents are billed at or above its own price is kept whole:
 * that reads as the operator listing the wrong ids, and the pack is what the base will charge.
 */

export type RequestedLine = {
  code: string;
  amountMinor: number;
  /** Codes of the extras this one bundles. */
  bundles: readonly string[];
};

/**
 * The amount each requested line should carry, by code, or null for a line a requested pack
 * already covers. `chargedElsewhere` is what the rest of the quote bills, by extra code.
 */
export function netOfBundles(
  lines: readonly RequestedLine[],
  chargedElsewhere: ReadonlyMap<string, number>,
): Map<string, number | null> {
  const byCode = new Map(lines.map((line) => [line.code, line]));
  /* Two packs naming each other is a data error, not two covers, so neither drops the other. */
  const covered = new Set(
    lines.flatMap((line) =>
      line.bundles.filter(
        (code) => code !== line.code && byCode.get(code)?.bundles.includes(line.code) === false,
      ),
    ),
  );

  return new Map(
    lines.map((line) => {
      if (covered.has(line.code)) return [line.code, null];

      const paidMinor = line.bundles
        .filter((code) => code !== line.code)
        .reduce((total, code) => total + (chargedElsewhere.get(code) ?? 0), 0);
      const amountMinor =
        paidMinor > 0 && paidMinor < line.amountMinor
          ? line.amountMinor - paidMinor
          : line.amountMinor;
      return [line.code, amountMinor];
    }),
  );
}
