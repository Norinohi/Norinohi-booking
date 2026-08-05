import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { YachtDetailScreen } from "@/features/yachts";
import { prefetchListingDetail } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("Seo.YachtDetail");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: `/yachts/${id}`,
    noIndex: true,
  });
}

export default async function YachtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { state, title } = await prefetchListingDetail(id);

  return (
    <Hydrated state={state}>
      <YachtDetailScreen title={title} />
    </Hydrated>
  );
}
