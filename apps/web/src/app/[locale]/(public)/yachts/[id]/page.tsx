import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { BookingProvider, BookingSidebar } from "@/features/booking";
import { YachtDetailScreen } from "@/features/yachts";
import { isListingNotFound, prefetchListingDetail } from "@/features/yachts/api/server";
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

const CREW_KEYS = ["bareboat", "skipper", "full-crew"] as const;

/** `crewType` arrives as a provider-supplied string; only these three have a label to show. */
function crewKey(value: string | null | undefined): (typeof CREW_KEYS)[number] | null {
  return CREW_KEYS.find((key) => key === value) ?? null;
}

/**
 * Joins sentences while they fit, so the description ends on a full stop rather than mid-word.
 * They arrive in descending order of usefulness, and the first overflow ends it.
 */
function withinBudget(sentences: (string | null)[]): string {
  let out = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > DESCRIPTION_BUDGET) break;
    out = next;
  }

  return out;
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
  const detail = await prefetchListingDetail(id).catch(() => null);

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

  const crew = await getTranslations("Common.crewTypes");
  const format = await getFormatter();

  const key = crewKey(seo.crewType);
  const price = seo.priceFromMinor ? format.number(seo.priceFromMinor / 100, "eur") : null;

  /*
   * Built here rather than reusing `seo.description`: that string is the visible body copy, runs
   * past 240 characters so a search result cuts it mid-sentence, and opens on the year built.
   */
  const description = withinBudget([
    seo.category && seo.berths && seo.cabins
      ? t("metaSpecs", { category: seo.category, guests: seo.berths, cabins: seo.cabins })
      : null,
    key && seo.base ? t("metaPlace", { crew: crew(key), place: seo.base }) : null,
    price ? t("metaPrice", { price }) : null,
    t("metaCta"),
  ]);

  return buildMetadata({
    locale,
    title,
    description: description || seo.description,
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
    detail = await prefetchListingDetail(id);
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
            description: detail.seo.description,
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
        <YachtDetailScreen
          title={detail.title}
          aside={
            <BookingProvider>
              <BookingSidebar />
            </BookingProvider>
          }
        />
      </Hydrated>
    </>
  );
}
