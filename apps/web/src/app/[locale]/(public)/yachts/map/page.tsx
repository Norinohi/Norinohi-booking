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
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/yachts/map",
  });
}

export default async function YachtsMapPage() {
  const state = await prefetchSearch();

  return (
    <Hydrated state={state}>
      <Suspense fallback={null}>
        <MapScreen />
      </Suspense>
    </Hydrated>
  );
}
