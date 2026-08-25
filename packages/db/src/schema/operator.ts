import { index, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

export const operator = pgTable(
  "operator",
  {
    id: id("op"),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    country: text("country"),
    city: text("city"),
    email: text("email"),
    phone: text("phone"),
    /**
     * The operator's full terms and conditions, free text in whatever language
     * they wrote them, and the only place Booking Manager publishes a cancellation
     * policy - it is not on the reservation, offer or yacht, which is why this is
     * an operator attribute rather than a listing one. Measured 2026-08-25: 590 of
     * 1,310 companies publish one, from 5k to 26k characters. Null is normal.
     */
    termsAndConditions: text("terms_and_conditions"),
    ...timestamps,
  },
  (table) => [index("operator_slug_idx").on(table.slug)],
);
