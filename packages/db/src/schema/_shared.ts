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

/*
 * Monetary amounts only (minor units + currency); rates use pct().
 *
 * Generic over the name so the template-literal keys survive into the table type.
 * With a plain `string` parameter TypeScript widens the computed keys to an index
 * signature, which erases `<name>Minor`/`<name>Currency` from every table that
 * spreads this — the reason the one caller needed an `as any` to update them.
 *
 * Note this emits `<name>_currency`, while every hand-rolled money column in the
 * schema pairs its minor units with a bare `currency`. listing_amenity is the only
 * table on this shape; reconciling the two is a rename migration, not a refactor.
 */
export const money = <Name extends string>(name: Name) => {
  const minor = integer(`${name}_minor`);
  const currency = text(`${name}_currency`);

  return { [`${name}Minor`]: minor, [`${name}Currency`]: currency } as {
    [K in `${Name}Minor`]: typeof minor;
  } & { [K in `${Name}Currency`]: typeof currency };
};

export const pct = (name: string) => numeric(name, { precision: 6, scale: 4 });
