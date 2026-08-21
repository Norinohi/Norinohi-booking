import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { DEFAULT_LOCALE } from "./localize";

/**
 * The parts of a priced line this reads.
 *
 * Structural rather than the `QuoteLine` row type, because the same lines pass through here in
 * two shapes: the provider's, before a quote is persisted, and the database's, after.
 */
export type LocalizableQuoteLine = { code: string; label: string; kind: string };

/**
 * A priced quote's line labels in the reader's language.
 *
 * Applied when a quote is read, never when one is written. A quote row is an immutable priced
 * snapshot a booking is traceable to, and an invoice, a confirmation email and an operator's
 * admin view all read the same row — freezing one visitor's locale into it would decide the
 * language of all three. So the stored label stays the vendor's own and this swaps it on the
 * way out.
 *
 * The same two dictionaries the catalogue page reads, in the same order of authority: the
 * provider's own wording for this exact extra, then the curated label for a fee written that
 * way by anyone, then what the provider called it. Lines that are not extras - the charter
 * itself, discounts, credit - carry no vendor name and are left alone.
 */
export async function localizeQuoteLines<T extends LocalizableQuoteLine>(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  lines: T[],
  locale: string | undefined,
): Promise<T[]> {
  if (lines.length === 0 || !locale || locale === DEFAULT_LOCALE) return lines;

  const extras = lines.filter((line) => line.kind === "extra" || line.kind === "fee");
  if (extras.length === 0) return lines;

  const byId = await labelsByExtraCode(
    db,
    listingId,
    extras.map((line) => line.code),
    locale,
  );
  const byName = await labelsByName(
    db,
    extras.map((line) => line.label),
    locale,
  );

  return lines.map((line) => {
    const translated = byId.get(line.code) ?? byName.get(normalizedName(line.label));
    return translated === undefined ? line : { ...line, label: translated };
  });
}

/**
 * `provider_extra_translation` for these codes, in `locale`.
 *
 * Scoped to the quote's own listing, which is the point of the join. A line's code is
 * `<kind>:<externalId>` and names no provider, while the two vendors number their services
 * independently: NauSYS sells `service:1` as a skipper, so matching a Booking Manager line of
 * the same id against it would label a cleaning fee "Skipper". Resolving through
 * `provider_extra_catalogue` for this listing reads the id in the id space it came from.
 */
async function labelsByExtraCode(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  codes: string[],
  locale: string,
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();

  const rows = await db.execute<{ code: string; label: string }>(sql`
    select distinct on (code)
      extra.kind || ':' || extra.external_id as code,
      translation.label as label
    from provider_extra_catalogue extra
    join provider_extra_translation translation
      on translation.source = extra.source
      and translation.kind = extra.kind
      and translation.external_id = extra.external_id
      and translation.locale = ${locale}
    where extra.listing_id = ${listingId}
      and extra.kind || ':' || extra.external_id in ${sql`(${sql.join(
        codes.map((code) => sql`${code}`),
        sql`, `,
      )})`}
  `);

  return new Map(rows.rows.map((row) => [row.code, row.label]));
}

/** `extra_label_translation` for these names, in `locale`. Source-agnostic by design. */
async function labelsByName(
  db: NodePgDatabase<typeof schema>,
  names: string[],
  locale: string,
): Promise<Map<string, string>> {
  const keys = [...new Set(names.map(normalizedName))].filter(Boolean);
  if (keys.length === 0) return new Map();

  const rows = await db.execute<{ nameKey: string; label: string }>(sql`
    select name_key as "nameKey", label
    from extra_label_translation
    where locale = ${locale}
      and name_key in ${sql`(${sql.join(
        keys.map((key) => sql`${key}`),
        sql`, `,
      )})`}
  `);

  return new Map(rows.rows.map((row) => [row.nameKey, row.label]));
}

/** Mirrors extraNameKeySql in repository.ts and extraNameKey in apply-translations.ts. */
function normalizedName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}
