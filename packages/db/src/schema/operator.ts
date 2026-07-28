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
    ...timestamps,
  },
  (table) => [index("operator_slug_idx").on(table.slug)],
);
