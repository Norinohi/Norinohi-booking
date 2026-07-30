import type { Formats } from "next-intl";

export const formats = {
  dateTime: {
    /* Pairs with `dayToDisplay` — both sides UTC, so a calendar day never shifts by an offset. */
    day: { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  },
  number: {
    eur: { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
  },
} satisfies Formats;
