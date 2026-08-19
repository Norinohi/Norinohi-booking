import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { BookingScreen } from "@/features/booking";
import { isListingNotFound, prefetchListingDetail } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("Seo.Booking");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: `/yachts/${id}/booking`,
    noIndex: true,
  });
}

export default async function YachtBookingPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;

  let detail: Awaited<ReturnType<typeof prefetchListingDetail>>;
  try {
    detail = await prefetchListingDetail(id, locale);
  } catch (error) {
    if (error instanceof Error && isListingNotFound(error)) {
      notFound();
    }
    throw error;
  }

  // nuqs reads the query string, so the screen sits behind a boundary; the listing is prefetched
  // and hydrated so the sidebar, crew default and the boat recap resolve on the first render.
  return (
    <Hydrated state={detail.state}>
      <Suspense fallback={null}>
        <BookingScreen />
      </Suspense>
    </Hydrated>
  );
}
