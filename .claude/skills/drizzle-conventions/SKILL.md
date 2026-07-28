---
name: drizzle-conventions
description: Repo conventions for authoring Drizzle schema in packages/db for the yacht-charter marketplace. Use when creating or editing any table/schema file under packages/db/src/schema, adding enums/money/jsonb columns, or running db:push. TRIGGER when editing files that import from drizzle-orm/pg-core or when the task mentions the DB schema, tables, migrations, or entities from docs/backend-architecture.md.
---

# Drizzle schema conventions (yacht-charter)

Authoritative model: `docs/backend-architecture.md` (§1–§2 entities, Appendix A). This skill encodes the *how*. Match these idioms exactly — the existing `packages/db/src/schema/auth.ts` set the precedent.

## Non-negotiable rules
1. **Text PKs, never uuid/serial.** Use the shared `id(prefix)` helper (below). Prefixes are typed: `ylst_` listing, `bkg_` booking, `qte_` quote, `op_` operator, etc.
2. **snake_case in DB, camelCase in TS.**
3. **Money = integer minor units + ISO currency**, in pairs (`total_minor` int/bigint + `currency` text). **Percentages = exact `numeric`** (commission/VAT/discount). Never `float`/`real`/`double`.
4. **Closed sets = `pgEnum`** (statuses, rule types, `resource_type`, match status). Externalise *user-facing* labels to `facet_dictionary` for i18n — enums are internal codes.
5. **`jsonb`** for breakdowns, raw payloads, match signals, payment policy, commercial snapshots.
6. **Indexes = array form** (3rd `pgTable` arg): `(table) => [index("x_idx").on(table.col)]`.
7. **Relations declared separately** via `relations()` exports.
8. **Barrel re-export is mandatory.** Every new file MUST be added to `packages/db/src/schema/index.ts` (`export * from "./x"`), or `drizzle({ schema })` can't see it. Forgetting this is the #1 silent bug.
9. **Never edit `auth.ts`** except via `packages/auth` (better-auth owns its shape). Adding `user.role` for admin is the one sanctioned change — do it in `packages/auth` then `db:push`.
10. **Provider boundary:** never use a provider's numeric id as a PK. It lives in `provider_record.external_id`, unique on `(provider, resource_type, external_id)`.

## Shared primitives — `packages/db/src/schema/_shared.ts`
```ts
import { customType, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid"; // add nanoid to packages/db deps

export const id = (prefix: string) =>
  text("id").primaryKey().$defaultFn(() => `${prefix}_${nanoid()}`);

export const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
};

// money helper: amount in minor units + currency, always together
export const money = (name: string) => ({
  [`${name}Minor`]: integer(`${name}_minor`),          // e.g. price_minor
  [`${name}Currency`]: text(`${name}_currency`),        // ISO-4217
});

export const pct = (name: string) => numeric(name, { precision: 6, scale: 4 }); // exact percentage
```

## Canonical table shape
```ts
import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { operator } from "./operator";

export const listingStatus = pgEnum("listing_status", ["draft", "published", "hidden"]);

export const listing = pgTable("listing", {
  id: id("ylst"),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  operatorId: text("operator_id").notNull().references(() => operator.id, { onDelete: "restrict" }),
  status: listingStatus("status").default("draft").notNull(),
  ...timestamps,
}, (t) => [index("listing_operator_idx").on(t.operatorId)]);

export const listingRelations = relations(listing, ({ one, many }) => ({
  operator: one(operator, { fields: [listing.operatorId], references: [operator.id] }),
  media: many(listingMedia),
}));
```

## Workflow & gates
- Apply schema with `pnpm db:push` (dev flow — there is no `src/migrations/` yet; do NOT hand-write migrations for the demo).
- Verify with `pnpm db:studio`.
- Gate with `pnpm check-types` + `pnpm build`. Do **not** run `pnpm check` unless you intend the `oxfmt --write` reformat.
- After adding a file: (1) re-export in `schema/index.ts`, (2) `db:push`, (3) `check-types`.

## Checklist before you finish
- [ ] Text PK via `id(prefix)` · [ ] snake_case columns · [ ] money as minor+currency, pct as numeric
- [ ] pgEnum for closed sets · [ ] indexes in array form · [ ] separate `relations()`
- [ ] **re-exported in `schema/index.ts`** · [ ] `db:push` clean · [ ] `check-types` green
