"use client";

import { useQuery } from "@tanstack/react-query";
import { endOfMonth, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";

import type { DatePeriod } from "@yacht-charter/api/lib/availability-rules";
import {
  combinedFirstBookablePeriod,
  combinedRangeStatus,
  type OfferConstraints,
} from "@yacht-charter/api/lib/offer-availability";

import { dayFromNative, dayToNative } from "@/lib/date";

import { availabilityConstraintsQueryOptions } from "../api/queries";
import type { ListingDetail } from "../types";

export type RefusedPeriod = DatePeriod & { offerId: string };

/**
 * The last day the sidebar asks about, which is the last day either provider has an
 * answer for: both sweep occupancy and rates over `[thisYear, thisYear + 1]`.
 *
 * This used to be a flat six months. Constraints outside the window come back empty and
 * empty reads as season-closed, so every boat whose current season had ended showed a
 * calendar that was grey to the horizon while its next season was fully published. The
 * Shannon fleet lost all thirty sellable weeks of 2027 that way.
 */
function constraintsHorizon(today: Date): Date {
  return endOfMonth(new Date(today.getFullYear() + 1, 11, 1));
}

/**
 * What each vendor will sell for this listing, the refusals this visit has added on top, and
 * the period the panel should open on when the visitor brought none.
 */
export function useOfferConstraints(listing: ListingDetail, searchedCheckOut: string | undefined) {
  const listingId = listing?.id ?? "";
  /* The listing's own first sellable charter, which the undated result card shows as its dates. */
  /* The next charter where the stored one lapsed between syncs, so the panel still opens on one. */
  const bookablePeriod =
    listing?.availability.bookablePeriod ?? listing?.availability.nextPeriod ?? null;
  const bookableCheckOut = bookablePeriod?.checkOut;

  const calWindow = useMemo(() => {
    const from = startOfMonth(new Date());
    const horizon = dayFromNative(constraintsHorizon(from));
    /*
     * A carried period can fall past the default horizon — people book a year out. Constraints
     * the window does not cover come back empty, which reads as season-closed, and the sidebar
     * would refuse to price the very dates it was handed. The materialised period is the same
     * story for a boat sold out until next season: it is the one charter worth opening on, so
     * the window has to reach it.
     */
    const beyond = [searchedCheckOut, bookableCheckOut].filter(
      (day) => day != null && day > horizon,
    );
    const furthest = dayToNative(beyond.sort().at(-1) ?? null);
    return {
      from: dayFromNative(from),
      to: furthest ? dayFromNative(endOfMonth(furthest)) : horizon,
    };
  }, [searchedCheckOut, bookableCheckOut]);

  const { data: published } = useQuery({
    ...availabilityConstraintsQueryOptions({
      listingId,
      from: calWindow.from,
      to: calWindow.to,
    }),
    enabled: Boolean(listingId),
  });

  /*
   * Periods a live quote refused, each against the offer that refused it. The published
   * constraints are what the provider said in its dump, and a refusal is it correcting them,
   * so the period stays out for the rest of the visit rather than inviting the same 409 again.
   *
   * Kept per offer rather than per listing: one vendor declining a week says nothing about the
   * other, and applying it to both would hide a charter that is still for sale.
   */
  const [refusedPeriods, setRefusedPeriods] = useState<readonly RefusedPeriod[]>([]);

  /*
   * A period the vendor refused stays refused — it said no and it is the authority — but only
   * that period. Adding it to `occupied` made the calendar infer the days were taken, which
   * blocked every overlapping range without ever asking: refuse a fortnight from a Saturday
   * and the free week starting the same day vanished with it.
   */
  /*
   * Two sources of refusal, and they mean the same thing. The sync records the periods the
   * provider declined when its offers were swept, which is what keeps a week the vendor will
   * not sell off the calendar before anyone clicks it; this session adds the ones a live quote
   * turned down since. Both are exact periods, so they concatenate.
   */
  const offers: OfferConstraints[] = useMemo(
    () =>
      (published?.offers ?? []).map((offer) => ({
        offerId: offer.offerId,
        providerCode: offer.provider,
        rules: offer.rules,
        occupied: offer.occupied,
        priced: offer.priced,
        confirmed: offer.confirmed,
        refused: [
          ...offer.refused,
          ...refusedPeriods.filter((period) => period.offerId === offer.offerId),
        ],
      })),
    [published, refusedPeriods],
  );

  /*
   * Without a searched period, the listing's own first bookable charter opens the panel instead.
   * That period is materialised against the same rules the calendar draws from, so it normally
   * stands as sent; the walk forward only earns its keep when the read model has gone stale
   * under it, where the alternative is a panel that opens on nothing.
   */
  const suggestedPeriod = useMemo(() => {
    if (!bookablePeriod || !published) return null;
    if (
      combinedRangeStatus(bookablePeriod.checkIn, bookablePeriod.checkOut, offers).verdict ===
      "bookable"
    ) {
      return bookablePeriod;
    }
    const found = combinedFirstBookablePeriod(bookablePeriod.checkIn, offers);
    return found ? { checkIn: found.startDate, checkOut: found.endDate } : null;
  }, [bookablePeriod, published, offers]);

  function refusePeriod(period: RefusedPeriod) {
    setRefusedPeriods((current) => [...current, period]);
  }

  return {
    offers,
    constraintsLoaded: Boolean(published),
    suggestedPeriod,
    refusePeriod,
  };
}
