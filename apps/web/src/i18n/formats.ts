import type { Formats } from "next-intl";

export const formats = {
  dateTime: {
    day: { day: "numeric", month: "long", year: "numeric" },
    time: { hour: "2-digit", minute: "2-digit", hour12: false },
  },
  number: {
    eur: { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
  },
} satisfies Formats;
