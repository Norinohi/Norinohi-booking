import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingScreen } from "@/features/booking";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("Seo.Booking");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: `/yachts/${id}/booking`,
    noIndex: true,
  });
}

export default function YachtBookingPage() {
  return <BookingScreen />;
}
