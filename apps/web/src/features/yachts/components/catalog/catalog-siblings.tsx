import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { type CatalogPage, catalogPageHeading, catalogPageHref } from "../../lib/catalog-page";

/**
 * Links to the pages beside this one.
 *
 * Only the catalogue pages carry it; the design for `/yachts` has no such block. A sitemap is an
 * invitation, internal links are the signal, and without these the deeper pages are reachable
 * only from the sitemap.
 */
export default async function CatalogSiblings({
  siblings,
  regions = [],
}: {
  siblings: CatalogPage[];
  regions?: CatalogPage[];
}) {
  const t = await getTranslations("Seo.CatalogPage");
  if (siblings.length === 0 && regions.length === 0) return null;

  return (
    <div className="flex flex-col gap-6 border-t border-natural-50 pt-6">
      <LinkList heading={t("regions")} pages={regions} t={t} />
      <LinkList heading={t("siblings")} pages={siblings} t={t} />
    </div>
  );
}

function LinkList({
  heading,
  pages,
  t,
}: {
  heading: string;
  pages: CatalogPage[];
  t: Awaited<ReturnType<typeof getTranslations<"Seo.CatalogPage">>>;
}) {
  if (pages.length === 0) return null;

  return (
    <nav className="flex flex-col gap-3">
      <h2 className="text-h6 text-foreground">{heading}</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {pages.map((page) => (
          <li key={catalogPageHref(page)}>
            <Link
              href={catalogPageHref(page)}
              className="text-body-m text-brand-600 underline underline-offset-4"
            >
              {catalogPageHeading(t, page)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
