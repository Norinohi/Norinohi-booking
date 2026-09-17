import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import LegalDocumentPending from "@/components/shared/layout/legal-document-pending";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Legal.cancellation");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/cancellation-policy",
    noIndex: true,
  });
}

export default function CancellationPolicyPage() {
  return <LegalDocumentPending document="cancellation" />;
}
