"use client";

import { useEffect, useRef, useState } from "react";

import {
  combinedRangeStatus,
  type OfferConstraints,
} from "@yacht-charter/api/lib/offer-availability";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";

import type { Quote } from "../api/queries";
import { isSlotConflict } from "../lib/slot-conflict";
import type { CrewType, ListingDetail } from "../types";
import type { RefusedPeriod } from "./use-offer-constraints";
import type { useQuote } from "./use-quote";

type LiveQuote = ReturnType<typeof useQuote>;

export interface QuotePricingOptions {
  slug: string;
  quoteId: string | null | undefined;
  listing: ListingDetail;
  quote: Quote | null;
  quoteFor: LiveQuote["quoteFor"];
  repriceWith: LiveQuote["repriceWith"];
  offers: readonly OfferConstraints[];
  constraintsLoaded: boolean;
  searchedPeriod: CharterPeriod | null;
  suggestedPeriod: CharterPeriod | null;
  refusePeriod: (period: RefusedPeriod) => void;
  guests: number;
  crewType: CrewType | undefined;
  extras: string[];
  requestedExtras: string[];
  setSlotError: (refused: boolean) => void;
}

/**
 * Prices a period: the one the page opens on by itself, and every one the visitor picks after.
 * A refusal is recorded against the offer that made it, and said out loud only for a pick.
 */
export function useQuotePricing({
  slug,
  quoteId,
  listing,
  quote,
  quoteFor,
  repriceWith,
  offers,
  constraintsLoaded,
  searchedPeriod,
  suggestedPeriod,
  refusePeriod,
  guests,
  crewType,
  extras,
  requestedExtras,
  setSlotError,
}: QuotePricingOptions) {
  const listingId = listing?.id ?? "";
  const [refusedSearchPeriod, setRefusedSearchPeriod] = useState<CharterPeriod | null>(null);
  /*
   * A period the vendor could not price at all (it was down, or answered with an error), kept so
   * the panel can say so and ask again. Without it a seeded period that failed left only "Select
   * dates", as though the visitor had picked nothing.
   */
  const [failedPeriod, setFailedPeriod] = useState<CharterPeriod | null>(null);
  /*
   * The currency the card quoted, which the panel has to answer in. Undefined until the listing
   * loads, and nothing is quoted before then, so the request never falls back to the default.
   */
  const listingCurrency =
    listing?.priceFrom?.currency ?? listing?.priceDetails.securityDeposit?.currency;

  /*
   * Prices that period once, as soon as the published constraints are in — before them every
   * range reads as season-closed, since `priced` is what opens a season. Only on the detail
   * page: the wizard arrives with `quoteId` and loads that quote instead. A period the listing
   * will not sell is left alone rather than reported, because the visitor did not ask for this
   * boat on these dates so much as arrive at it, and the calendar is already open.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    /*
     * `quote` is in the guard beside the id, because the id is only the usual reason there is
     * already a price on screen and not the whole of it. This effect has no dependency list on
     * purpose - it re-reads its own conditions every render - so a render where the URL has no
     * `quoteId` is enough to run it, and a mounted wizard can reach one: any navigation that
     * drops the parameter while the page stays alive. It then minted a second, bare quote over
     * a live one, taking the extras, promo and credit off the sidebar with it.
     */
    if (seededRef.current || quoteId || quote || !constraintsLoaded || !listingId) return;
    const period = searchedPeriod ?? suggestedPeriod;
    if (!period) return;

    if (combinedRangeStatus(period.checkIn, period.checkOut, offers).verdict !== "bookable") {
      /*
       * A period the page guessed is still dropped in silence, for the reason `pricePeriod`
       * gives. One the visitor carried in is not: they asked for these dates, and the panel
       * falling back to "Select dates" with nothing said reads as a broken picker. It is also
       * the only signal for a window our synced calendar still calls free while the vendor no
       * longer does, which no amount of filtering in search can predict.
       */
      if (!searchedPeriod) return;
      setRefusedSearchPeriod(searchedPeriod);

      /* Open on something sellable rather than on nothing, so the answer comes with an offer. */
      if (
        suggestedPeriod &&
        combinedRangeStatus(suggestedPeriod.checkIn, suggestedPeriod.checkOut, offers).verdict ===
          "bookable"
      ) {
        seededRef.current = true;
        pricePeriod(suggestedPeriod, { report: false });
      }
      return;
    }

    seededRef.current = true;
    pricePeriod(period, { report: false });
  });

  function selectPeriod(period: CharterPeriod) {
    /*
     * The notice names the period carried in from search, so it is answered the moment the
     * visitor picks their own: left standing beside a freshly chosen October week it reads as
     * a complaint about the dates now on screen rather than the ones they arrived with.
     */
    setRefusedSearchPeriod(null);
    pricePeriod(period, { report: true });
  }

  /*
   * `report` is what separates the visitor's own click from the period this page opened itself
   * on. Both record the refusal, because the vendor turning a period down is the same fact
   * either way and the calendar has to retire it. Only the click says so out loud: the seeded
   * period is a guess made from the read model, and answering an arrival with "those dates are
   * not bookable" blames the visitor for dates they never picked.
   *
   * Quiet for the visitor is not the same as quiet for us, and this used to be both. A seeded
   * quote that failed left the sidebar on "select your dates to see the price" and said
   * nothing anywhere: a NauSYS mapping bug made every date on one listing unquotable for as
   * long as it was live, and the only symptom was an empty panel. Anything that is not the
   * vendor declining these exact dates is written to the console with the listing and the
   * period, whoever asked. The server names the same failure on its side; see `reportRefusal`
   * in packages/api/src/services/quote.ts.
   */
  function pricePeriod(period: CharterPeriod, { report }: { report: boolean }) {
    /* The verdict names the offer that would sell it, which is the one a refusal belongs to. */
    const verdict = combinedRangeStatus(period.checkIn, period.checkOut, offers);
    if (verdict.verdict !== "bookable") return;
    const refusedBy = verdict.offerId;
    setSlotError(false);
    setFailedPeriod(null);
    void (
      quote
        ? repriceWith(period)
        : quoteFor({
            ...period,
            guests,
            crewType,
            extras,
            requestedExtras,
            currency: listingCurrency,
          })
    ).catch((error: Error) => {
      const dates = `${period.checkIn}..${period.checkOut}`;
      if (!isSlotConflict(error)) {
        /*
         * Logged rather than rethrown. The throw landed in a promise nobody awaited, so it
         * surfaced as an unhandled rejection with no listing, no dates and no stack worth
         * reading - which is how a broken listing looked like a quiet one.
         */
        console.error(`[booking] pricing ${slug} ${dates} failed`, error);
        setFailedPeriod(period);
        return;
      }

      if (refusedBy !== null) {
        refusePeriod({ offerId: refusedBy, startDate: period.checkIn, endDate: period.checkOut });
      }
      /* A refusal of the dates this page chose for itself is worth one line, not a banner. */
      if (report) setSlotError(true);
      else console.warn(`[booking] ${slug} opened on ${dates}, which the vendor refused`);
    });
  }

  function retryPricing() {
    if (failedPeriod) pricePeriod(failedPeriod, { report: true });
  }

  return { refusedSearchPeriod, selectPeriod, pricingFailed: failedPeriod !== null, retryPricing };
}
