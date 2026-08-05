import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { MapScreen } from "@/features/yachts";
import { prefetchSearch } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.YachtsMap");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/yachts/map",
  });
}

export default async function YachtsMapPage() {
  const state = await prefetchSearch();

  return (
    <Hydrated state={state}>
      <MapScreen />
    </Hydrated>
  );
}
