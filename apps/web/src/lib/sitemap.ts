import "server-only";

import { env } from "@yacht-charter/env/web";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { prefetchCatalogPages } from "@/features/yachts/api/server";
import { defaultLocale, locales } from "@/i18n/config";
import { CATALOG_TAG } from "@/lib/cache-tags";
import { publicClient } from "@/utils/orpc";

/*
 * Shared by the sitemap index and each of its children.
 *
 * Split by page type rather than kept as one file, because Search Console reports coverage per
 * submitted sitemap: one file answers "1800 of 2400 indexed" without saying which 600 are missing,
 * while four answer it by type.
 *
 * Only indexable routes belong here. Anything passing `noIndex: true` to `buildMetadata` is
 * omitted: login, register, booking, confirmation, consultation, `/wishlist`, `/yachts/map`,
 * and everything under `/profile`.
 */
export const STATIC_PATHS = ["/", "/yachts", "/plan-my-trip"] as const;

/** Page size is capped at 50 by `listingSearchInputSchema`; the bound stops a bad cursor looping. */
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

/** Process start, which is deploy time here — the only moment the static routes can change. */
export const BUILT_AT = new Date();

/** Every child, and the order the index lists them in. */
export const SITEMAP_NAMES = ["static", "catalog", "shipyard", "listings"] as const;

function localizePath(path: string, locale: string) {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function absolute(path: string) {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

/*
 * One entry per locale, each carrying the full alternate set including itself and x-default —
 * the pairing Google asks for. It mirrors what `buildMetadata` puts in the page head, so the
 * two sources agree instead of sending search engines conflicting hreflang graphs.
 */
export function entriesFor(path: string, lastModified?: Date): MetadataRoute.Sitemap {
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
 * A failure degrades to an empty file rather than a failed build: an empty sitemap is recoverable
 * on the next deploy, a failed deploy is not.
 *
 * Paged, not cursored: `results` only switches to cursor mode once a cursor is supplied, so the
 * first call — which by definition has none — came back with `nextCursor: null` and ended the
 * walk. The sitemap shipped exactly one page of listings, whatever the catalog held.
 *
 * Cached on the catalog tag, so a crawler hit no longer re-walks the whole catalog; a provider
 * sync drops it along with the rest of the catalog reads.
 */
export async function listingPaths(): Promise<string[]> {
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
 * The generated catalog pages under one root, from the same enumeration `generateStaticParams`
 * reads. One source, so a sitemap can never advertise a combination the router will not build —
 * the failure that turns a submitted sitemap into a page of 404s in Search Console.
 */
export async function catalogPagePaths(root: "yacht-charter" | "shipyard"): Promise<string[]> {
  /* The default locale: only the headings are translated, and no sitemap reads one. */
  const pages = await prefetchCatalogPages(defaultLocale);
  return pages
    .filter((page) => page.root === root)
    .map((page) => `/${page.root}/${page.segments.join("/")}`);
}

/** An empty file beats a failed render: the other three still reach Search Console. */
export async function safely(paths: () => Promise<string[]>, name: string): Promise<string[]> {
  try {
    return await paths();
  } catch (error) {
    console.error(`[sitemap] ${name} enumeration failed, emitting an empty file`, error);
    return [];
  }
}
