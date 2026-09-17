import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

export type CatalogPage = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["catalogPages"]>
>[number];

type CatalogPageTranslator = ReturnType<typeof useTranslations<"Seo.CatalogPage">>;

/** How many sibling links a page carries. Enough to spread crawl depth, few enough to read. */
const SIBLING_LIMIT = 8;

/*
 * How many catalog pages the build prerenders, counted across both roots and before the locale
 * multiplies them. Prerendering the whole enumeration dominated the web deploy: every page costs
 * several API reads at a concurrency of 3, and every one adds files to the standalone image.
 */
const PRERENDER_LIMIT = 300;

export function catalogPageHref(page: CatalogPage): string {
  return `/${page.root}/${page.segments.join("/")}`;
}

/**
 * The pages under one root that the build prerenders: the largest by listing count, since those
 * carry the traffic. Every other page in the enumeration still exists and renders on its first
 * request, its reads already cached on the catalog tag.
 *
 * Never empty for a root that has pages, because Cache Components fails the build when
 * `generateStaticParams` returns nothing.
 */
export function prerenderedCatalogPages(
  pages: CatalogPage[],
  root: CatalogPage["root"],
): CatalogPage[] {
  const byCount = pages.toSorted((a, b) => b.count - a.count);
  const selected = byCount.slice(0, PRERENDER_LIMIT).filter((page) => page.root === root);
  if (selected.length > 0) return selected;

  const largest = byCount.find((page) => page.root === root);
  return largest ? [largest] : [];
}

/**
 * Matched on the whole segment array, never segment by segment.
 *
 * It is what keeps `/yacht-charter/catamaran` apart from `/yacht-charter/croatia` without a
 * reserved word in the path: position one is a type only when the enumeration says a type page
 * lives there.
 */
export function findCatalogPage(
  pages: CatalogPage[],
  root: CatalogPage["root"],
  segments: string[],
): CatalogPage | undefined {
  const path = segments.join("/");
  return pages.find((page) => page.root === root && page.segments.join("/") === path);
}

/**
 * The page's own heading, which its title and `BreadcrumbList` reuse.
 *
 * `labels` arrives in reading order from the enumeration, so each kind knows which of its entries
 * is the place and which is the type without carrying named fields through the contract.
 */
export function catalogPageHeading(t: CatalogPageTranslator, page: CatalogPage): string {
  const [first = "", second = "", third = "", fourth = ""] = page.labels;

  switch (page.kind) {
    case "country":
      return t("country", { place: first });
    case "geo":
      return t("geo", { place: second, country: first });
    case "marina":
      return t("marina", { place: third });
    case "type":
      return t("type", { type: first });
    case "type-country":
      return t("typeCountry", { type: first, place: second });
    case "type-geo":
      return t("typeGeo", { type: first, place: third, country: second });
    case "type-marina":
      return t("typeMarina", { type: first, place: fourth });
    case "builder":
      return t("builder", { brand: first });
    case "model":
      return t("model", { model: second });
  }
}

/**
 * Pages under the same parent, which is what carries crawl depth past the sitemap.
 *
 * A sitemap is an invitation; internal links are the signal. Siblings rather than children on
 * purpose: a country page linking its cities, and a city page linking the other cities, reaches
 * the whole level from anywhere in it.
 */
export function catalogPageSiblings(pages: CatalogPage[], page: CatalogPage): CatalogPage[] {
  const parent = page.segments.slice(0, -1).join("/");

  return pages
    .filter(
      (other) =>
        other.root === page.root &&
        other.segments.length === page.segments.length &&
        other.segments.slice(0, -1).join("/") === parent &&
        other.segments.join("/") !== page.segments.join("/"),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, SIBLING_LIMIT);
}

/**
 * One step of the trail. `name` is the page heading `BreadcrumbList` carries; `label` is the
 * place, type or shipyard alone, which is what fits in a visible crumb.
 */
export type CatalogCrumb = { name: string; label: string; path: string; exists: boolean };

/**
 * The trail from the page's root-most ancestor down to the page, for both the visible
 * breadcrumbs and `BreadcrumbList`. An ancestor the enumeration withholds (below the threshold,
 * or not a real place) keeps its slug as the name, and the visible trail leaves it unlinked.
 */
export function catalogPageTrail(
  t: CatalogPageTranslator,
  pages: CatalogPage[],
  page: CatalogPage,
): CatalogCrumb[] {
  return page.segments.map((_, index) => {
    const trail = page.segments.slice(0, index + 1);
    const crumb = findCatalogPage(pages, page.root, trail);
    const slug = trail[index] ?? "";
    return {
      name: crumb ? catalogPageHeading(t, crumb) : slug,
      label: crumb?.labels.at(-1) ?? slug,
      path: `/${page.root}/${trail.join("/")}`,
      exists: crumb !== undefined,
    };
  });
}
