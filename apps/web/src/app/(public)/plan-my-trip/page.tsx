import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlannerScreen } from "@/features/plan-my-trip";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PlanMyTrip");
  return { title: t("title") };
}

export default function PlanMyTripPage() {
  return <PlannerScreen />;
}
