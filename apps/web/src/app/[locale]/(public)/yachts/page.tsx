import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { SearchScreen } from "@/features/yachts";
import { prefetchSearch } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Yachts");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/yachts",
  });
}

export default async function YachtsPage() {
  const state = await prefetchSearch();

  // SearchScreen owns its own boundaries — one per URL-reading region — so the page does not wrap
  // it in a blanket <Suspense> that would keep the whole screen out of the shell.
  return (
    <Hydrated state={state}>
      <SearchScreen />
    </Hydrated>
  );
}
