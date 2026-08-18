import { env } from "@yacht-charter/env/web";

import { defaultLocale } from "@/i18n/config";
import { SITE_NAME } from "@/lib/seo";

/*
 * Structured data, kept deliberately thin.
 *
 * Every field below is something the page actually renders. Nothing here invents a price, a
 * rating, or a company detail — fabricated markup is what earns a manual action, and a Product
 * block that disagrees with the visible page is worse than no block at all.
 *
 * Notably absent: `aggregateRating`. The detail page does render `rating` and `reviewCount` from
 * a real `review` table, so the markup would be structurally valid — but Google's review-snippet
 * policy is about provenance, not schema, and these ratings are provider/seed supplied rather
 * than first-party verified reviews. Add `aggregateRating` once that provenance is settled.
 */

type OrganizationNode = {
  "@type": "Organization";
  name: string;
  url: string;
  logo: string;
};

type BreadcrumbItemNode = {
  "@type": "ListItem";
  position: number;
  name: string;
  item: string;
};

type BreadcrumbListNode = {
  "@type": "BreadcrumbList";
  itemListElement: BreadcrumbItemNode[];
};

type ProductNode = {
  "@type": "Product";
  name: string;
  description: string;
  image: string;
  url: string;
  category: string;
  brand: { "@type": "Brand"; name: string };
  model: string;
};

type ItemListNode = {
  "@type": "ItemList";
  name: string;
  numberOfItems: number;
  itemListElement: { "@type": "ListItem"; position: number; name: string; url: string }[];
};

type Node = BreadcrumbListNode | ItemListNode | OrganizationNode | ProductNode;

function absolute(path: string) {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

function localized(path: string, locale: string) {
  return absolute(path === "/" ? `/${locale}` : `/${locale}${path}`);
}

/**
 * One `<script>` per page: a single node is emitted bare, several are folded into an `@graph`
 * rather than stacked as sibling tags.
 *
 * `</script>` inside a JSON string literal closes the tag early and drops the remainder of the
 * document into the page as markup. Listing titles and descriptions are provider-supplied, so
 * this is a real injection surface. Replacing every `<` with its JSON unicode escape closes it:
 * the payload stays valid JSON and parses back identically, while both `</script` and `<!--` —
 * the only two exits from script-data state — need a literal `<` to trigger.
 */
export function JsonLd({ data }: { data: Node | Node[] }) {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** Site identity. Only name, URL and logo — anything richer would be invented. */
export function organizationNode(): OrganizationNode {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: absolute(`/${defaultLocale}`),
    logo: absolute("/seo/og-default.jpg"),
  };
}

export function breadcrumbNode(
  items: { name: string; path: string }[],
  locale: string,
): BreadcrumbListNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: localized(item.path, locale),
    })),
  };
}

export type ListingNodeInput = {
  name: string;
  description: string;
  image: string;
  builder: string;
  model: string;
  category: string;
  path: string;
  locale: string;
};

/**
 * A charter listing as a `Product`.
 *
 * No `offers`: pricing is quote-driven and deliberately uncached (see `features/yachts/api/
 * server`), and the detail page renders no figure of its own. Marking up a price the page never
 * shows is the kind of mismatch that gets structured data ignored at best.
 */
export function listingNode(listing: ListingNodeInput): ProductNode {
  return {
    "@type": "Product",
    name: listing.name,
    description: listing.description,
    image: listing.image,
    url: localized(listing.path, listing.locale),
    category: listing.category,
    brand: { "@type": "Brand", name: listing.builder },
    model: listing.model,
  };
}

/**
 * A facet page's boats as an ordered list.
 *
 * No rich result rides on this — product carousels are reserved for Google's own programs — but
 * it states plainly that the page is a list of N specific listings rather than an article, and
 * every entry is a link the page already renders.
 */
export function itemListNode(list: {
  name: string;
  items: { name: string; path: string }[];
  locale: string;
}): ItemListNode {
  return {
    "@type": "ItemList",
    name: list.name,
    numberOfItems: list.items.length,
    itemListElement: list.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: localized(item.path, list.locale),
    })),
  };
}
