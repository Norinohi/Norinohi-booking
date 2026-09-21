import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { DEFAULT_LOCALE } from "./localize";
import { normalizedKey } from "./normalize";

/**
 * The parts of a priced line this reads.
 *
 * Structural rather than the `QuoteLine` row type, because the same lines pass through here in
 * two shapes: the provider's, before a quote is persisted, and the database's, after.
 */
export type LocalizableQuoteLine = {
  code: string;
  label: string;
  kind: string;
  detail?: string | null;
};

/**
 * `service:100511@66279570` → `service:100511`. The catalogue and both dictionaries know the
 * extra, not the vendor's row for one of its variants. Mirrors `baseExtraCode` in
 * `@yacht-charter/providers/shared/extra-code`, which this package cannot import.
 */
function baseCode(code: string): string {
  const at = code.indexOf("@");
  return at === -1 ? code : code.slice(0, at);
}

/** The extra's own name, from a label a variant line ends with its detail. */
function nameOf(line: LocalizableQuoteLine): string {
  const suffix = line.detail ? ` (${line.detail})` : "";
  return suffix && line.label.endsWith(suffix) ? line.label.slice(0, -suffix.length) : line.label;
}

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
 * way by anyone, then what the provider called it. A NauSYS discount is named from the
 * vendor's own multilingual discountItems dump. The other lines - the charter itself, our
 * promos, credit - carry no vendor name and are left alone.
 */
export async function localizeQuoteLines<T extends LocalizableQuoteLine>(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  lines: T[],
  locale: string | undefined,
): Promise<T[]> {
  if (lines.length === 0 || !locale || locale === DEFAULT_LOCALE) return lines;

  const discounts = await discountNames(db, lines, locale);
  const extras = lines.filter((line) => line.kind === "extra" || line.kind === "fee");
  if (extras.length === 0) {
    return discounts.size === 0 ? lines : lines.map((line) => withDiscountName(line, discounts));
  }

  const byId = await labelsByExtraCode(
    db,
    listingId,
    [...new Set(extras.map((line) => baseCode(line.code)))],
    locale,
  );
  const byName = await labelsByName(db, extras.map(nameOf), locale);

  return lines.map((line) => {
    if (line.kind !== "extra" && line.kind !== "fee") return withDiscountName(line, discounts);
    const translated = byId.get(baseCode(line.code)) ?? byName.get(normalizedName(nameOf(line)));
    if (translated === undefined) return line;
    /* The variant is the operator's own words and has no translation; it goes back on as is. */
    return { ...line, label: line.detail ? `${translated} (${line.detail})` : translated };
  });
}

const NAUSYS_DISCOUNT_PREFIX = "nausys-discount-";

/** Where NauSYS spells a language's key other than by its code. */
const NAUSYS_TEXT_KEY = new Map([
  ["sv", "SE"],
  ["uk", "UA"],
  ["da", "DK"],
]);

/**
 * NauSYS's own names for the discounts on these lines, in `locale`, from the synced
 * discountItems dump, which names each in eighteen languages. A locale it does not carry keeps
 * the English the quote was stored with.
 */
async function discountNames(
  db: NodePgDatabase<typeof schema>,
  lines: readonly LocalizableQuoteLine[],
  locale: string,
): Promise<Map<string, string>> {
  const ids = lines
    .filter((line) => line.kind === "discount" && line.code.startsWith(NAUSYS_DISCOUNT_PREFIX))
    .map((line) => line.code.slice(NAUSYS_DISCOUNT_PREFIX.length));
  if (ids.length === 0) return new Map();

  const key = `text${NAUSYS_TEXT_KEY.get(locale) ?? locale.toUpperCase()}`;
  const rows = await db.execute<{ id: string; name: string | null }>(sql`
    select record.external_id as id, payload.payload->'name'->>${key} as name
    from provider_record record
    join provider on provider.id = record.provider_id and provider.code = 'nausys'
    join provider_raw_payload payload on payload.id = record.raw_payload_id
    where record.resource_type = 'discount_item'
      and record.external_id in ${sql`(${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`}
  `);
  return new Map(rows.rows.flatMap((row) => (row.name ? [[row.id, row.name] as const] : [])));
}

function withDiscountName<T extends LocalizableQuoteLine>(line: T, names: Map<string, string>): T {
  if (line.kind !== "discount" || !line.code.startsWith(NAUSYS_DISCOUNT_PREFIX)) return line;
  const name = names.get(line.code.slice(NAUSYS_DISCOUNT_PREFIX.length));
  return name === undefined ? line : { ...line, label: name };
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
const normalizedName = normalizedKey;
