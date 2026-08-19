import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { MapScreen } from "@/features/yachts";
import { prefetchSearch } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.YachtsMap");
  // Same listings as /yachts, only drawn differently, so indexing both makes them compete for one
  // set of queries. `follow` keeps the crawler walking through to the listing pages.
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/yachts/map",
    noIndex: true,
    follow: true,
  });
}

export default async function YachtsMapPage() {
  const state = await prefetchSearch();
  const t = await getTranslations("YachtsMap");

  return (
    <Hydrated state={state}>
      {/* Outside the boundary, or it never reaches the HTML at all; `sr-only` because the map is
          full-bleed and has nowhere to put a visible heading. */}
      <h1 className="sr-only">{t("title")}</h1>
      <Suspense fallback={null}>
        <MapScreen />
      </Suspense>
    </Hydrated>
  );
}
