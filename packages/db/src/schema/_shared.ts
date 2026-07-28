import { integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

// Shared column helpers — see docs/backend-architecture.md Appendix A.

export const id = (prefix: string) =>
  text("id")
    .primaryKey()
    .$defaultFn(() => `${prefix}_${nanoid()}`);

export const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// Monetary amounts only (minor units + currency); rates use pct().
export const money = (name: string) => ({
  [`${name}Minor`]: integer(`${name}_minor`),
  [`${name}Currency`]: text(`${name}_currency`),
});

export const pct = (name: string) => numeric(name, { precision: 6, scale: 4 });
