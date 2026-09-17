import type { CharterPeriod } from "@/components/shared/form/charter-date-field";

import type { SavedCardInput } from "../api/queries";

const DAY_MS = 86_400_000;

/**
 * What a saved card is priced for: the visitor's basis and language, and the period they last
 * searched, sent the way the search sends it (`startDate` and `duration`) so the server prices it
 * on the same path. Fields only where they are set, since each one is part of the query key.
 */
export function savedCardInput(
  locale: string,
  priceBasis: SavedCardInput["priceBasis"] | null,
  period: CharterPeriod | null,
): SavedCardInput {
  const input: SavedCardInput = { locale };
  if (priceBasis) input.priceBasis = priceBasis;
  if (period) {
    input.startDate = period.checkIn;
    input.duration = Math.round(
      (Date.parse(period.checkOut) - Date.parse(period.checkIn)) / DAY_MS,
    );
  }
  return input;
}
