import { sql } from "drizzle-orm";

import { requiresOperatorConfirmation } from "../sellable-offer";
import { basePriceInEur, comparablePrice } from "./pricing-sql";
import { overlapsSlotHold } from "./slot-holds";
import type { ListingSearchDoc, TemporaryHold } from "./types";

/* The column is selected only by the two searches that have a period to compare against. */
/*
 * Exported for `popular-yachts.ts`, which selects the same columns and normalizes the same way.
 * The alternative was a second projection of listing_search_doc that would drift from this one.
 */
export type SearchRow = Omit<
  ListingSearchDoc,
  "sellsRequestedPeriod" | "nearestCheckIn" | "nearestCheckOut" | "temporaryHold"
> & {
  sellsRequestedPeriod?: boolean;
  nearestCheckIn?: string | null;
  nearestCheckOut?: string | null;
  temporaryHold?: TemporaryHold | null;
};

/*
 * The two numbers the card and the sidebar show under "booked / viewed". Both are
 * counted here rather than stored on `listing_search_doc`, because the doc is only
 * rebuilt on sync or publish and these change by the hour — a stored copy would be
 * a stale number presented as today's.
 *
 * Booked counts bookings that are still standing and were confirmed this month:
 * one taken and then cancelled or refunded is not a charter the visitor is
 * competing with, so only `CONFIRMED` counts. Both windows are UTC, matching how
 * `recordListingView` stamps a view, so neither count shifts with the server's
 * local timezone.
 */
const engagementColumns = sql`
  (
    select count(*)::integer
    from booking b
    where b.listing_id = doc.listing_id
      and b.status = 'CONFIRMED'
      and b.confirmed_at >= date_trunc('month', now() at time zone 'utc')
  ) as "bookedThisMonth",
  (
    select count(*)::integer
    from listing_view v
    where v.listing_id = doc.listing_id
      and v.viewed_on = (now() at time zone 'utc')::date
  ) as "viewedToday"
`;

/*
 * The advertised charter, minus the weeks our own live checkouts have already taken.
 *
 * `bookable_from`/`bookable_to` are projected from what the provider last said and refreshed on
 * the sync's own cycle, so a period somebody is mid-checkout on keeps its place on the card for
 * up to an hour after the option was taken. The booking sidebar subtracts those holds at read
 * time (`slotHoldsAsOccupancy`), which is how a card came to advertise Oct 31 - Nov 7 while the
 * calendar one click away painted that same week as temporarily held.
 *
 * The period is dropped rather than moved on to the next one. Choosing the next candidate is the
 * scan `read-model.ts` runs over every offer's slots, free periods and check-in rules, and a
 * search page cannot pay for it per card. Without a period the price reverts to the season floor
 * and the chip reads "on request", which is what the listing honestly is until the hold resolves.
 *
 * This only ever narrows what a card claims, the same guarantee `slot-holds.ts` carries.
 */
const heldByLiveBooking = overlapsSlotHold(
  sql`doc.listing_id`,
  sql`doc.bookable_from`,
  sql`doc.bookable_to`,
);

export const searchColumns = sql`
  doc.listing_id as "listingId",
  doc.slug,
  doc.name,
  doc.title,
  doc.category,
  doc.crew_type as "crewType",
  doc.builder,
  doc.model,
  doc.model_canonical as "modelCanonical",
  doc.operator,
  doc.operator_terms_and_conditions as "operatorTermsAndConditions",
  doc.base_id as "baseId",
  doc.base_name as "baseName",
  doc.city,
  doc.location,
  doc.region,
  doc.country,
  doc.lat,
  doc.lng,
  doc.base_email as "baseEmail",
  doc.base_phone as "basePhone",
  doc.base_website as "baseWebsite",
  doc.base_check_in_time as "baseCheckInTime",
  doc.base_check_out_time as "baseCheckOutTime",
  doc.length_m as "lengthM",
  doc.cabins,
  doc.berths,
  doc.heads,
  doc.showers,
  doc.year_built as "yearBuilt",
  doc.sail_type as "sailType",
  doc.security_deposit_minor as "securityDepositMinor",
  doc.security_deposit_currency as "securityDepositCurrency",
  doc.security_deposit_when_insured_minor as "securityDepositWhenInsuredMinor",
  doc.deposit_insurance_included as "depositInsuranceIncluded",
  doc.pets_allowed as "petsAllowed",
  doc.best_value as "bestValue",
  doc.rating,
  doc.review_count as "reviewCount",
  ${engagementColumns},
  doc.main_image as "mainImage",
  doc.gallery,
  doc.amenities,
  doc.price_from_minor as "priceFromMinor",
  doc.price_is_from as "priceIsFrom",
  doc.list_price_from_minor as "listPriceFromMinor",
  ${comparablePrice()} as "priceFromMinorEur",
  doc.base_price_from_minor as "basePriceFromMinor",
  ${basePriceInEur()} as "basePriceFromMinorEur",
  doc.best_offer_id as "bestOfferId",
  exists (
    select 1 from listing_offer bo
    where bo.id = doc.best_offer_id
      and ${requiresOperatorConfirmation({
        optionApprovalRequired: sql`bo.option_approval_required`,
        fixedBookingSupported: sql`bo.fixed_booking_supported`,
      })}
  ) as "requiresOperatorConfirmation",
  doc.offer_count as "offerCount",
  doc.currency,
  doc.available_from as "availableFrom",
  doc.available_to as "availableTo",
  case when ${heldByLiveBooking} then null else doc.bookable_from end as "bookableFrom",
  case when ${heldByLiveBooking} then null else doc.bookable_to end as "bookableTo"
`;

export function normalizeSearchRow(row: SearchRow): ListingSearchDoc {
  return {
    ...row,
    gallery: row.gallery ?? [],
    amenities: row.amenities ?? [],
    /* Absent on the lookups that carry no searched period, where there is nothing to contradict. */
    sellsRequestedPeriod: row.sellsRequestedPeriod ?? true,
    nearestCheckIn: row.nearestCheckIn ?? null,
    nearestCheckOut: row.nearestCheckOut ?? null,
    temporaryHold: row.temporaryHold ?? null,
  };
}
