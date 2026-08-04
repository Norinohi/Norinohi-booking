import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { YachtDetailScreen } from "@/features/yachts";
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

export default function YachtDetailPage() {
  return <YachtDetailScreen />;
}
