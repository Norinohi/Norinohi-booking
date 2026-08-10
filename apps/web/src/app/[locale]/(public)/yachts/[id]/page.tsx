import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { YachtDetailScreen } from "@/features/yachts";
import { isListingNotFound, prefetchListingDetail } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

/*
 * TODO: Cache Components adoption. This route cannot yet drop its opt-out.
 *
 * `[id]` is not fully enumerable, so Next must build a shell for unknown params — and in that
 * shell `locale` is unknown too, which blocks the root layout's `await params` and with it
 * `NextIntlClientProvider`. The blocker is the layout, not this page: everything below already
 * defers correctly. Removing this needs the root layout to stop awaiting params, which is a
 * decision about the locale architecture, not a fix to this route.
 */
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("Seo.YachtDetail");

  /*
   * Detail pages are indexable, so the title has to name the boat — one shared "Yacht Details"
   * across every listing reads as duplicate content. The read is the same cached call the page
   * body makes below, so it costs nothing extra; a miss falls back to the generic title and
   * lets the body own the 404.
   */
  const listing = await prefetchListingDetail(id).catch(() => null);

  return buildMetadata({
    locale,
    title: listing?.title ?? t("title"),
    description: t("description"),
    path: `/yachts/${id}`,
  });
}

/*
 * The listing is awaited at the top of the page, not inside a `<Suspense>` boundary.
 *
 * Deferring it does make the page frame paint before the data — but by then the response has
 * already begun streaming, so `notFound()` for an unknown id renders the not-found UI under a
 * 200 status instead of a 404 (measured). While this route is opted out of instant validation it
 * gets no static shell either way, so that trade buys little and costs a wrong status code.
 *
 * When the layout blocker above is resolved and this route can genuinely be instant, move this
 * read into a boundary — and solve the 404 separately, with a cheap existence check ahead of the
 * stream. `YachtDetailScreen` already accepts an absent `title`, so it can serve as its own
 * fallback when that happens.
 */
export default async function YachtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof prefetchListingDetail>>;
  try {
    detail = await prefetchListingDetail(id);
  } catch (error) {
    /*
     * An unknown listing arrives as a thrown marker rather than a returned flag, so the absence is
     * never cached — a listing created after someone visited its URL resolves on the next request
     * instead of 404ing for the rest of the hour. Matched by marker, not `instanceof`: errors are
     * serialized out of a cached function and lose their class.
     */
    if (isListingNotFound(error)) {
      notFound();
    }
    throw error;
  }

  return (
    <Hydrated state={detail.state}>
      <YachtDetailScreen title={detail.title} />
    </Hydrated>
  );
}
