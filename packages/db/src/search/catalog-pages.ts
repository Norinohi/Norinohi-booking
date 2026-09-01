import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { facetTranslator } from "./localize";
import { valueForLabel } from "./repository";

/**
 * Which generated catalog pages exist, and what each one filters on.
 *
 * One read, one source of truth. `generateStaticParams`, the sitemap and the page itself all
 * resolve from this list, so a URL can never be advertised that the router does not build, or
 * built for a combination that has nothing behind it.
 *
 * Existence is a threshold, not a decision. A combination with a handful of boats reads as thin
 * content and drags down the pages around it, so it simply has no page until the catalogue grows
 * into it — no commit required either way.
 */

export const DEFAULT_CATALOG_PAGE_THRESHOLD = 20;

export type CatalogPageRoot = "yacht-charter" | "shipyard";

export type CatalogPageKind =
  | "country"
  | "geo"
  | "marina"
  | "type"
  | "type-country"
  | "type-geo"
  | "type-marina"
  | "builder"
  | "model";

export type CatalogPageFilters = {
  country?: string;
  region?: string;
  city?: string;
  marina?: string;
  category?: string;
  builder?: string;
  model?: string;
};

export type CatalogPage = {
  root: CatalogPageRoot;
  kind: CatalogPageKind;
  /** Path segments below the root, already slugged. */
  segments: string[];
  /**
   * Exact catalogue values, never the slugs. Search normalizes by stripping non-alphanumerics,
   * which folds "Mali Lošinj" to `maliloinj` while its slug folds to `malilosinj` — so a slug
   * round-trips through a URL but does not survive a filter.
   */
  filters: CatalogPageFilters;
  /** The same values in reading order, for the heading and the breadcrumb trail. */
  labels: string[];
  count: number;
};

/**
 * Diacritics are folded rather than dropped: `slugify` in the providers package leaves
 * "Mali Lošinj" as `mali-lo-inj`, which is not a URL anybody would type or link.
 */
export function toSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/*
 * Filter values are facet-style, not `toSlug`. The filter controls select an option by its exact
 * `valueForLabel` value, so a catalogue page that pinned "Croatia" would filter correctly and
 * still leave the Country control reading "All countries".
 */
const v = valueForLabel;

type Row = Record<string, string | number | null>;

async function group(
  db: NodePgDatabase<typeof schema>,
  columns: string[],
  threshold: number,
): Promise<Row[]> {
  const selected = sql.join(
    columns.map((column) => sql.raw(`doc.${column}`)),
    sql`, `,
  );
  const present = sql.join(
    columns.map((column) => sql.raw(`doc.${column} is not null and doc.${column} <> ''`)),
    sql` and `,
  );

  const rows = await db.execute<Row>(sql`
    select ${selected}, count(*)::integer as "count"
    from listing_search_doc doc
    where ${present}
    group by ${sql.join(
      columns.map((_, index) => sql.raw(String(index + 1))),
      sql`, `,
    )}
    having count(*) >= ${threshold}
  `);

  return rows.rows;
}

const str = (row: Row, key: string): string => String(row[key] ?? "");

export async function listCatalogPages(
  db: NodePgDatabase<typeof schema>,
  options: { threshold?: number; locale?: string } = {},
): Promise<CatalogPage[]> {
  const threshold = options.threshold ?? DEFAULT_CATALOG_PAGE_THRESHOLD;
  const of = (columns: string[]) => group(db, columns, threshold);

  /*
   * Labels are translated, slugs and filter values are not. A URL is a stable identifier and the
   * filters compare against the untranslated column, so only the words a reader sees move.
   *
   * `facet_media` has no kind for a city, a builder or a model — a city name is rarely translated
   * and a brand never should be — so those three keep their catalogue spelling in every locale.
   */
  const translate = await facetTranslator(db, options.locale);
  const label = (kind: "country" | "region" | "marina" | "category", value: string) =>
    translate ? translate(kind, value) : value;

  const [
    countries,
    regions,
    cities,
    marinas,
    types,
    typeCountries,
    typeRegions,
    typeCities,
    typeMarinas,
    builders,
    models,
  ] = await Promise.all([
    of(["country"]),
    of(["country", "region"]),
    of(["country", "city"]),
    of(["country", "city", "base_name"]),
    of(["category"]),
    of(["category", "country"]),
    of(["category", "country", "region"]),
    of(["category", "country", "city"]),
    of(["category", "country", "city", "base_name"]),
    of(["builder"]),
    of(["builder", "model_canonical"]),
  ]);

  const pages: CatalogPage[] = [];

  const push = (page: CatalogPage) => pages.push(page);

  for (const row of countries) {
    const country = str(row, "country");
    push({
      root: "yacht-charter",
      kind: "country",
      segments: [toSlug(country)],
      filters: { country: v(country) },
      labels: [label("country", country)],
      count: Number(row.count),
    });
  }

  /*
   * Regions and cities share one segment, the way Sailogy files `turkey/turkish-coast` next to
   * `turkey/fethiye`. Cities are pushed second and lose the de-duplication below, because a
   * region named after its city ("Split region" slugs apart, but "Hvar" does not) is the broader
   * page of the two and the one a searcher means.
   */
  for (const row of regions) {
    const country = str(row, "country");
    const region = str(row, "region");
    push({
      root: "yacht-charter",
      kind: "geo",
      segments: [toSlug(country), toSlug(region)],
      filters: { country: v(country), region: v(region) },
      labels: [label("country", country), label("region", region)],
      count: Number(row.count),
    });
  }

  for (const row of cities) {
    const country = str(row, "country");
    const city = str(row, "city");
    push({
      root: "yacht-charter",
      kind: "geo",
      segments: [toSlug(country), toSlug(city)],
      filters: { country: v(country), city: v(city) },
      labels: [label("country", country), city],
      count: Number(row.count),
    });
  }

  for (const row of marinas) {
    const country = str(row, "country");
    const city = str(row, "city");
    const marina = str(row, "base_name");
    push({
      root: "yacht-charter",
      kind: "marina",
      segments: [toSlug(country), toSlug(city), toSlug(marina)],
      filters: { country: v(country), city: v(city), marina: v(marina) },
      labels: [label("country", country), city, label("marina", marina)],
      count: Number(row.count),
    });
  }

  /*
   * The type leads, so `/yacht-charter/catamaran/croatia` reads the way the query is phrased and
   * the geography nests underneath identically at every level. Position one is a category only
   * when it matches one, which is what keeps it apart from a country.
   */
  for (const row of types) {
    const category = str(row, "category");
    push({
      root: "yacht-charter",
      kind: "type",
      segments: [toSlug(category)],
      filters: { category: v(category) },
      labels: [label("category", category)],
      count: Number(row.count),
    });
  }

  for (const row of typeCountries) {
    const category = str(row, "category");
    const country = str(row, "country");
    push({
      root: "yacht-charter",
      kind: "type-country",
      segments: [toSlug(category), toSlug(country)],
      filters: { category: v(category), country: v(country) },
      labels: [label("category", category), label("country", country)],
      count: Number(row.count),
    });
  }

  for (const row of typeRegions) {
    const category = str(row, "category");
    const country = str(row, "country");
    const region = str(row, "region");
    push({
      root: "yacht-charter",
      kind: "type-geo",
      segments: [toSlug(category), toSlug(country), toSlug(region)],
      filters: { category: v(category), country: v(country), region: v(region) },
      labels: [label("category", category), label("country", country), label("region", region)],
      count: Number(row.count),
    });
  }

  for (const row of typeCities) {
    const category = str(row, "category");
    const country = str(row, "country");
    const city = str(row, "city");
    push({
      root: "yacht-charter",
      kind: "type-geo",
      segments: [toSlug(category), toSlug(country), toSlug(city)],
      filters: { category: v(category), country: v(country), city: v(city) },
      labels: [label("category", category), label("country", country), city],
      count: Number(row.count),
    });
  }

  for (const row of typeMarinas) {
    const category = str(row, "category");
    const country = str(row, "country");
    const city = str(row, "city");
    const marina = str(row, "base_name");
    push({
      root: "yacht-charter",
      kind: "type-marina",
      segments: [toSlug(category), toSlug(country), toSlug(city), toSlug(marina)],
      filters: { category: v(category), country: v(country), city: v(city), marina: v(marina) },
      labels: [
        label("category", category),
        label("country", country),
        city,
        label("marina", marina),
      ],
      count: Number(row.count),
    });
  }

  for (const row of builders) {
    const builder = str(row, "builder");
    push({
      root: "shipyard",
      kind: "builder",
      segments: [toSlug(builder)],
      filters: { builder: v(builder) },
      labels: [builder],
      count: Number(row.count),
    });
  }

  /*
   * The model alone, not the pair. `model` already matches the vendor name, the canonical name
   * and the builder, so adding the builder would narrow to listings whose model name happens to
   * contain it.
   */
  for (const row of models) {
    const builder = str(row, "builder");
    const model = str(row, "model_canonical");
    push({
      root: "shipyard",
      kind: "model",
      segments: [toSlug(builder), toSlug(model)],
      filters: { model: v(model) },
      labels: [builder, model],
      count: Number(row.count),
    });
  }

  /*
   * Two catalogue values can slug to the same path — a category named after a country, a city
   * named after its region. First one wins, which is the order above: broader pages before
   * narrower, geography before type.
   */
  const seen = new Set<string>();
  return pages.filter((page) => {
    const key = `${page.root}/${page.segments.join("/")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
