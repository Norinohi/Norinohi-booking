import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MapScreen } from "@/features/yachts";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.YachtsMap");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/yachts/map",
  });
}

export default function YachtsMapPage() {
  return <MapScreen />;
}
