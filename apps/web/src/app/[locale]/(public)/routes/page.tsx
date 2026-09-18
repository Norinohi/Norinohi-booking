import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.RoutesMap");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/routes",
  });
}

export default async function RoutesMapPage() {
  const t = await getTranslations("RoutesMap");
  /* `sr-only`: the map is full-bleed and the panel carries the visible title. */
  return <h1 className="sr-only">{t("title")}</h1>;
}
