"use client";

import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";
import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import { lastSearchedPeriod, useListingCards } from "@/features/yachts";
import { dayFromNative } from "@/lib/date";

import { useWishlistPage } from "../hooks/use-wishlist-page";

/*
 * WishlistScreen — the /wishlist layout: a "← Back" breadcrumb over one full-width
 * "Your Wishlist" panel holding the saved cards and their pager, or the "No saved yachts
 * yet" empty state. Identical for guests and signed-in users; the mode split lives in
 * useWishlistPage. Figma 972:54606 (filled) / 972:54666 (empty).
 */

export default function WishlistScreen() {
  const t = useTranslations("Wishlist");
  const { toCard } = useListingCards();
  const [page, setPage] = useState(1);
  /*
   * The visitor saved these while looking at a week, so a boat that sells it is priced, dated and
   * linked for it as the search showed it; the rest keep their own next charter. Read after mount:
   * session storage is not there to render against on the server.
   */
  const [searchedPeriod, setSearchedPeriod] = useState<CharterPeriod | null>();
  useEffect(() => {
    setSearchedPeriod(lastSearchedPeriod(dayFromNative(new Date())));
  }, []);

  const { isLoading, cards, totalItems, pageSize, hasStaleSaves } = useWishlistPage(
    page,
    searchedPeriod,
  );

  const pageCount = Math.max(Math.ceil(totalItems / pageSize), 1);

  /* Never listings.length: a page comes back short or even empty once saved listings are
   * unpublished, and that is a "some are unavailable" note, not an empty wishlist. */
  const isEmpty = totalItems === 0;

  /* Unsaving the last card on a trailing page would otherwise strand the user there. */
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Wishlist.back" backHref="/" />

      <div className="mx-auto w-full max-w-384 px-4 py-6 md:px-13.5 md:py-10 xl:px-17.5">
        <div className="mx-auto max-w-349">
          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-5 border-b border-natural-100 p-4 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
            </div>

            {isLoading ? (
              <div className="p-4 md:p-5">
                <Loader />
              </div>
            ) : isEmpty ? (
              <div className="px-4 py-10 md:px-5 md:py-14">
                <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 p-4 md:p-5">
                  {hasStaleSaves ? (
                    <p className="text-sm leading-[1.3] font-medium text-natural-500">
                      {t("someUnavailable")}
                    </p>
                  ) : null}

                  {cards.map((card, index) => (
                    <YachtCard
                      key={card.listing.id}
                      layout="row"
                      {...toCard(card.listing, card)}
                      priority={index === 0}
                    />
                  ))}
                </div>

                {pageCount > 1 ? (
                  <div className="flex justify-center border-t border-natural-100 px-5 py-5 xl:justify-start">
                    <PaginationControl
                      page={page}
                      pageSize={pageSize}
                      total={totalItems}
                      onPageChange={setPage}
                      summary={(range) => t("paginationSummary", range)}
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
