import type { Formats } from "next-intl";

export const formats = {
  dateTime: {
    /* Pairs with `dayToDisplay` — both sides UTC, so a calendar day never shifts by an offset. */
    day: { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
    /* Same, with a short month — for tight spots like the booking sidebar's date range. */
    dayShort: { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
    /* Yearless, for the near end of a range whose far end already carries the year. */
    dayCompact: { day: "numeric", month: "short", timeZone: "UTC" },
  },
  number: {
    eur: { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
  },
} satisfies Formats;
