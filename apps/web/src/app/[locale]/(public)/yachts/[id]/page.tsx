import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { BookingProvider, BookingSidebar } from "@/features/booking";
import { YachtDetailScreen } from "@/features/yachts";
import { isListingNotFound, prefetchListingDetail } from "@/features/yachts/api/server";
import { crewKey, joinWithinBudget } from "@/features/yachts/lib/listing-copy";
import { breadcrumbNode, JsonLd, listingNode } from "@/lib/json-ld";
import { buildMetadata, socialImage } from "@/lib/seo";

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

/* Google shows roughly 60 characters of a title, and `%s | YachtSkanner` claims 15 of them. */
const TITLE_BUDGET = 45;
const DESCRIPTION_BUDGET = 155;

type Seo = Awaited<ReturnType<typeof prefetchListingDetail>>["seo"];

/**
 * The listing's own copy, as translated sentences in descending order of usefulness.
 *
 * Most listings have no provider prose — NauSYS fills `highlightsIntText` for a minority of its
 * fleet, and never in Spanish — so this is the normal path, not a fallback. The head takes as
 * many of these as fit its budget; the page body and the `Product` node take all of them, which
 * is what keeps the three in agreement.
 */
async function describe(seo: Seo): Promise<string[]> {
  const t = await getTranslations("Seo.YachtDetail");
  const crew = await getTranslations("Common.crewTypes");
  const format = await getFormatter();

  /* A recognised code needs the local label; anything else the API already localized. */
  const key = crewKey(seo.crewType);
  const crewLabel = key ? crew(key) : seo.crewType;

  return [
    seo.category && seo.berths && seo.cabins
      ? t("metaSpecs", { category: seo.category, guests: seo.berths, cabins: seo.cabins })
      : null,
    crewLabel && seo.base ? t("metaPlace", { crew: crewLabel, place: seo.base }) : null,
    seo.priceFromMinor
      ? t("metaPrice", { price: format.number(seo.priceFromMinor / 100, "eur") })
      : null,
    t("metaCta"),
  ].filter((sentence): sentence is string => Boolean(sentence));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("Seo.YachtDetail");

  /*
   * Detail pages are indexable, so the head has to describe *this* boat — one shared
   * "Yacht Details" title and one shared stock card across every listing reads as duplicate
   * content and makes every shared link look identical. The read is the same cached call the
   * page body makes below, so it costs nothing extra; a miss falls back to the generic copy and
   * lets the body own the 404.
   */
  const detail = await prefetchListingDetail(id, locale).catch(() => null);

  /*
   * Canonical is keyed on the slug, never on `id` as typed. `listings.get` resolves either form,
   * so `/yachts/ylst_yacht-lagoon-42-aurora` and `/yachts/aurora-lagoon-42` are the same boat —
   * echoing the URL back would let both self-canonicalise and split their own ranking signals.
   */
  const path = `/yachts/${detail?.seo.slug ?? id}`;

  if (!detail) {
    return buildMetadata({
      locale,
      title: t("title"),
      description: t("description"),
      path,
    });
  }

  const { seo } = detail;

  /*
   * The country, not the marina: "… Charter in Croatia" is the phrase people search, while
   * "… Charter in Marina Zadar (ex. Tankerkomerc)" overruns the budget and matches nothing.
   * Switch to the city once the geo mapping lands — that is the stronger keyword of the two.
   */
  const withPlace = seo.country
    ? t("titleAtPlace", { boat: detail.title, place: seo.country })
    : null;
  const title =
    withPlace && withPlace.length <= TITLE_BUDGET
      ? withPlace
      : t("titlePlain", { boat: detail.title });

  /*
   * The generated sentences, not the provider's prose, even when there is prose: it is marketing
   * copy of unpredictable length that a search result cuts mid-sentence, while these are sized
   * for the snippet and lead with what a searcher is choosing between.
   */
  const description = joinWithinBudget(await describe(seo), DESCRIPTION_BUDGET);

  return buildMetadata({
    locale,
    title,
    description: description || t("description"),
    path,
    image: socialImage(seo.image),
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
export default async function YachtDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;

  let detail: Awaited<ReturnType<typeof prefetchListingDetail>>;
  try {
    detail = await prefetchListingDetail(id, locale);
  } catch (error) {
    /*
     * An unknown listing arrives as a thrown marker rather than a returned flag, so the absence is
     * never cached — a listing created after someone visited its URL resolves on the next request
     * instead of 404ing for the rest of the hour. Matched by marker, not `instanceof`: errors are
     * serialized out of a cached function and lose their class.
     */
    if (error instanceof Error && isListingNotFound(error)) {
      notFound();
    }
    throw error;
  }

  /* Mirrors the trail `YachtDetailScreen` renders — the same two crumbs, same order. */
  const t = await getTranslations("YachtDetail");
  const path = `/yachts/${detail.seo.slug}`;

  /*
   * Built on the server and threaded down, so the body, the `Product` node and the head all carry
   * the same words. Unbudgeted here: only the snippet has a length to respect.
   */
  const description = detail.seo.description ?? joinWithinBudget(await describe(detail.seo), 1000);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbNode(
            [
              { name: t("breadcrumbSearch"), path: "/yachts" },
              { name: detail.title, path },
            ],
            locale,
          ),
          listingNode({
            name: detail.title,
            description,
            /* Absolute and pre-cropped: a bare Cloudinary id is not a resolvable `image`. */
            image: socialImage(detail.seo.image),
            builder: detail.seo.builder,
            model: detail.seo.model,
            category: detail.seo.category,
            path,
            locale,
          }),
        ]}
      />
      <Hydrated state={detail.state}>
        {/* Wraps the whole screen, not just the sidebar: the optional-extras list in the main
            column reprices the same quote the sidebar renders, so both have to sit under one
            provider. */}
        <BookingProvider>
          <YachtDetailScreen
            title={detail.title}
            description={description}
            aside={<BookingSidebar />}
          />
        </BookingProvider>
      </Hydrated>
    </>
  );
}
