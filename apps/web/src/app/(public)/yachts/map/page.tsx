import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MapScreen } from "@/features/yachts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("YachtsMap");
  return { title: t("title") };
}

export default function YachtsMapPage() {
  return <MapScreen />;
}
