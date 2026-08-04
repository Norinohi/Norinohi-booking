import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlannerScreen } from "@/features/plan-my-trip";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.PlanMyTrip");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/plan-my-trip",
  });
}

export default function PlanMyTripPage() {
  return <PlannerScreen />;
}
