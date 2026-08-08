import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlannerScreen } from "@/features/plan-my-trip";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.PlanMyTrip");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/plan-my-trip",
  });
}

// PlannerScreen owns its own boundary — the wizard frame prerenders, only the URL-driven steps
// inside it defer — so the page does not wrap it in a blanket <Suspense>.
export default function PlanMyTripPage() {
  return <PlannerScreen />;
}
