import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ContactScreen } from "@/features/contact";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Contact");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/contact",
  });
}

export default function ContactPage() {
  return <ContactScreen />;
}
