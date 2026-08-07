import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingConfirmationScreen } from "@/features/booking";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("Seo.BookingConfirmation");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: `/yachts/${id}/booking/confirmation`,
    noIndex: true,
  });
}

export default function BookingConfirmationPage() {
  // nuqs reads the query string, so the screen has to sit behind a boundary to prerender.
  // The real loading skeleton lands with the instant-navigation work.
  return (
    <Suspense fallback={null}>
      <BookingConfirmationScreen />
    </Suspense>
  );
}
