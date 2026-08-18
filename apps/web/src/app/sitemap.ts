import { env } from "@yacht-charter/env/web";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { defaultLocale, locales } from "@/i18n/config";
import { CATALOG_TAG } from "@/lib/cache-tags";
import { prefetchCatalogPages } from "@/features/yachts/api/server";
import { publicClient } from "@/utils/orpc";

/*
 * Lives at `src/app/sitemap.ts`, outside `[locale]`, so it serves `/sitemap.xml` unprefixed —
 * the proxy matcher skips dotted paths, so next-intl leaves it alone.
 *
 * Only indexable routes belong here. Anything passing `noIndex: true` to `buildMetadata` is
 * omitted: login, register, booking, confirmation, consultation, `/wishlist`, `/yachts/map`,
 * and everything under `/profile`.
 */
const STATIC_PATHS = ["/", "/yachts", "/plan-my-trip"] as const;

/** Page size is capped at 50 by `listingSearchInputSchema`; the bound stops a bad cursor looping. */
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

/** Process start, which is deploy time here — the only moment the static routes can change. */
const BUILT_AT = new Date();

function localizePath(path: string, locale: string) {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function absolute(path: string) {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

/*
 * One entry per locale, each carrying the full alternate set including itself and x-default —
 * the pairing Google asks for. It mirrors what `buildMetadata` puts in the page head, so the
 * two sources agree instead of sending search engines conflicting hreflang graphs.
 */
function entriesFor(path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((locale) => [locale, absolute(localizePath(path, locale))]),
  );
  languages["x-default"] = absolute(localizePath(path, defaultLocale));

  return locales.map((locale) => ({
    url: absolute(localizePath(path, locale)),
    lastModified,
    alternates: { languages },
  }));
}

/**
 * Every listing slug, walked page by page.
 *
 * Detail pages are the catalog's organic surface, so a sitemap without them is half a sitemap.
 * A failure here degrades to the static routes rather than failing the build: an empty sitemap
 * is recoverable on the next deploy, a failed deploy is not.
 *
 * Paged, not cursored: `results` only switches to cursor mode once a cursor is supplied, so the
 * first call — which by definition has none — came back with `nextCursor: null` and ended the
 * walk. The sitemap shipped exactly one page of listings, whatever the catalog held.
 *
 * Cached on the catalog tag, so a crawler hit no longer re-walks the whole catalog; a provider
 * sync drops it along with the rest of the catalog reads.
 */
async function listingPaths(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const slugs: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await publicClient.charterSearch.results({ pageSize: PAGE_SIZE, page });

    for (const item of result.items) {
      slugs.push(`/yachts/${item.listing.slug}`);
    }

    // Absent only in cursor mode, which this walk never enters; treat it as "no more pages"
    // rather than looping to MAX_PAGES against a contract that changed underneath.
    if (page >= (result.pagination?.totalPages ?? page)) {
      return slugs;
    }
  }

  console.warn(
    `[sitemap] stopped at ${MAX_PAGES} pages (${slugs.length} listings); raise MAX_PAGES`,
  );
  return slugs;
}

/**
 * The generated catalog pages, read from the same enumeration `generateStaticParams` uses.
 *
 * One source, so the sitemap cannot advertise a combination the router does not build — the
 * failure that turns a submitted sitemap into a page of 404s in Search Console.
 */
async function catalogPagePaths(): Promise<string[]> {
  /* The default locale: only the headings are translated, and the sitemap reads none of them. */
  const pages = await prefetchCatalogPages(defaultLocale);
  return pages.map((page) => `/${page.root}/${page.segments.join("/")}`);
}

/*
 * Listings carry no `lastModified` at all, rather than one stamped at request time.
 *
 * `new Date()` told Google every URL had just changed on every fetch, which is how a site
 * teaches it to ignore the field entirely. Omitting it is neutral; restoring it needs a real
 * per-listing timestamp, which the search contract does not expose yet.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let listings: string[] = [];
  let catalogPages: string[] = [];

  try {
    [listings, catalogPages] = await Promise.all([listingPaths(), catalogPagePaths()]);
  } catch (error) {
    console.error("[sitemap] enumeration failed, emitting the static routes only", error);
  }

  return [
    ...STATIC_PATHS.flatMap((path) => entriesFor(path, BUILT_AT)),
    ...catalogPages.flatMap((path) => entriesFor(path)),
    ...listings.flatMap((path) => entriesFor(path)),
  ];
}
