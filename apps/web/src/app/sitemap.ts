import { env } from "@yacht-charter/env/web";
import type { MetadataRoute } from "next";

import { defaultLocale, locales } from "@/i18n/config";
import { publicClient } from "@/utils/orpc";

/*
 * Lives at `src/app/sitemap.ts`, outside `[locale]`, so it serves `/sitemap.xml` unprefixed —
 * the proxy matcher skips dotted paths, so next-intl leaves it alone.
 *
 * Only indexable routes belong here. Anything passing `noIndex: true` to `buildMetadata` is
 * omitted: login, register, booking, confirmation, consultation, and everything under
 * `/profile`. `/wishlist` is indexable but stays out too — it renders per-visitor and has
 * nothing for a crawler to land on.
 */
const STATIC_PATHS = ["/", "/yachts", "/yachts/map", "/plan-my-trip"] as const;

/** Page size is capped at 50 by `listingSearchInputSchema`; the bound stops a bad cursor looping. */
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

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
function entriesFor(path: string, lastModified: Date): MetadataRoute.Sitemap {
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
 * Every listing slug, walked with the search cursor.
 *
 * Detail pages are the catalog's organic surface, so a sitemap without them is half a sitemap.
 * A failure here degrades to the static routes rather than failing the build: an empty sitemap
 * is recoverable on the next deploy, a failed deploy is not.
 */
async function listingPaths(): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await publicClient.charterSearch.results({ pageSize: PAGE_SIZE, cursor });

    for (const item of result.items) {
      slugs.push(`/yachts/${item.listing.slug}`);
    }

    if (!result.nextCursor) {
      return slugs;
    }
    cursor = result.nextCursor;
  }

  console.warn(
    `[sitemap] stopped at ${MAX_PAGES} pages (${slugs.length} listings); raise MAX_PAGES`,
  );
  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  let listings: string[] = [];
  try {
    listings = await listingPaths();
  } catch (error) {
    console.error("[sitemap] listing enumeration failed, emitting static routes only", error);
  }

  return [...STATIC_PATHS, ...listings].flatMap((path) => entriesFor(path, lastModified));
}
