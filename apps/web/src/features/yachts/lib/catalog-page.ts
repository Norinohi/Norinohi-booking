import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

export type CatalogPage = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["catalogPages"]>
>[number];

type CatalogPageTranslator = ReturnType<typeof useTranslations<"Seo.CatalogPage">>;

/** How many sibling links a page carries. Enough to spread crawl depth, few enough to read. */
const SIBLING_LIMIT = 8;

export function catalogPageHref(page: CatalogPage): string {
  return `/${page.root}/${page.segments.join("/")}`;
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
