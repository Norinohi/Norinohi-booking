import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CatalogCards, CatalogSiblings, SearchScreen } from "@/features/yachts";
import {
  prefetchCatalogPages,
  prefetchCatalogResults,
  prefetchSearch,
} from "@/features/yachts/api/server";
import {
  type CatalogPage,
  catalogPageHeading,
  catalogPageHref,
  catalogPageSiblings,
  findCatalogPage,
} from "@/features/yachts/lib/catalog-page";
import { Hydrated } from "@/components/layout/hydrated";
import { breadcrumbNode, itemListNode, JsonLd } from "@/lib/json-ld";
import { buildMetadata } from "@/lib/seo";

/*
 * TODO: Cache Components adoption. Same blocker as the listing detail route: `[...segments]` is
 * enumerable, but the root layout awaits `params` for the locale, so the shell cannot be built.
 */
export const instant = false;

/** As many boats as the page shows, and as many as its ItemList declares. */
const PAGE_SIZE = 24;
const ROOT = "yacht-charter";

export async function generateStaticParams() {
  const pages = await prefetchCatalogPages();
  return pages.filter((page) => page.root === ROOT).map((page) => ({ segments: page.segments }));
}

/** The path's own facet, as the filter surfaces express it. Search normalizes the values. */
function lockedFor(page: CatalogPage) {
  const { country, region, city, marina, category, model } = page.filters;
  return {
    ...(country ? { country: [country] } : null),
    ...(region ? { sailingArea: [region] } : null),
    ...(city ? { city: [city] } : null),
    ...(marina ? { marina: [marina] } : null),
    ...(category ? { boatType: [category] } : null),
    ...(model ? { model: [model] } : null),
  };
}

async function resolve(segments: string[]) {
  const pages = await prefetchCatalogPages();
  const page = findCatalogPage(pages, ROOT, segments);
  return { pages, page };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments: string[]; locale: string }>;
}): Promise<Metadata> {
  const { segments, locale } = await params;
  const { page } = await resolve(segments);
  if (!page) return {};

  const t = await getTranslations("Seo.CatalogPage");

  return buildMetadata({
    locale,
    title: catalogPageHeading(t, page),
    description: t("description", { count: page.count }),
    path: catalogPageHref(page),
  });
}

export default async function CatalogPageRoute({
  params,
}: {
  params: Promise<{ segments: string[]; locale: string }>;
}) {
  const { segments, locale } = await params;
  const { pages, page } = await resolve(segments);

  /*
   * 404 rather than an empty page: the enumeration is the only thing that decides a catalog page
   * exists, so a combination below the threshold has no page to serve and must not be indexed as
   * one. Nothing links here either — the sitemap reads the same list.
   */
  if (!page) notFound();

  /* The facets too: without them the filter controls have no options to match the pinned facet
   * against, and every control reads as empty while the chips already name it. */
  const [results, facets] = await Promise.all([
    prefetchCatalogResults(page.filters, locale, PAGE_SIZE),
    prefetchSearch(),
  ]);
  const listings = results.items.map((item) => item.listing);

  const t = await getTranslations("Seo.CatalogPage");
  const heading = catalogPageHeading(t, page);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbNode(
            page.segments.map((_, index) => {
              const trail = page.segments.slice(0, index + 1);
              const crumb = findCatalogPage(pages, ROOT, trail);
              return {
                name: crumb ? catalogPageHeading(t, crumb) : (trail[index] ?? ""),
                path: `/${ROOT}/${trail.join("/")}`,
              };
            }),
            locale,
          ),
          itemListNode({
            name: heading,
            items: listings.map((listing) => ({
              name: listing.title,
              path: `/yachts/${listing.slug}`,
            })),
            locale,
          }),
        ]}
      />
      <Hydrated state={facets}>
        <SearchScreen
          heading={heading}
          locked={lockedFor(page)}
          resultsFallback={<CatalogCards listings={listings} />}
          footer={<CatalogSiblings siblings={catalogPageSiblings(pages, page)} />}
        />
      </Hydrated>
    </>
  );
}
