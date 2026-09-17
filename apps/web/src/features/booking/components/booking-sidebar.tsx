"use client";

import BookingSummary from "./summary/booking-summary";
import { useReportLiveSellable } from "@/components/shared/data-display/live-availability";
import type { AppPathname } from "@/i18n/navigation";
import { useState } from "react";

import { serializeBooking } from "../lib/search-params";
import { useBooking } from "./booking-provider";
import PeriodUrlSync from "./period-url-sync";
import QuoteRequestDialog from "./quote-request-dialog";

/*
 * The presentational sidebar. All quote/listing state lives in `BookingProvider`, so this reads the
 * shared context and only decides its own presentation: the Pay Now href (detail page only), the
 * Request Quote enquiry dialog, and whether to show actions / the shaded groups (wizard).
 */
export default function BookingSidebar({
  actions = true,
  shaded = false,
}: {
  actions?: boolean;
  shaded?: boolean;
}) {
  const {
    slug,
    listing,
    quote,
    offers,
    crewType,
    crewOptions,
    guests,
    isPending,
    slotError,
    refusedSearchPeriod,
    loadError,
    retryLoad,
    pricingFailed,
    retryPricing,
    selectPeriod,
    setCrew,
    setDropOff,
    setGuests,
    applyPromo,
    applyCredit,
    bookingId,
  } = useBooking();
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);
  const [bookingRequestOpen, setBookingRequestOpen] = useState(false);
  /* The operator confirms each booking by hand, so the quote is requested rather than paid. */
  const confirmsByHand = listing?.availability.requiresOperatorConfirmation ?? false;
  /* A priced quote for the chosen dates is the strongest evidence the page has that it sells. */
  useReportLiveSellable(quote !== null && !slotError);

  /* SAFETY: /yachts/[id]/booking is a real route; typedRoutes only recognises it when the
     segment is a literal, and nuqs serializes the query string back to a plain string. */
  const payNowHref =
    actions && quote && !confirmsByHand
      ? (serializeBooking(`/yachts/${slug}/booking`, { quoteId: quote.quoteId }) as AppPathname)
      : undefined;

  return (
    <>
      <PeriodUrlSync />
      <BookingSummary
        quote={quote}
        loading={isPending}
        stats={
          listing
            ? {
                booked: listing.bookingStats.bookedThisMonth,
                viewed: listing.bookingStats.viewedToday,
              }
            : null
        }
        offers={offers}
        selectedPeriod={quote ? { checkIn: quote.checkIn, checkOut: quote.checkOut } : undefined}
        onPeriodSelect={selectPeriod}
        slotError={slotError}
        refusedPeriod={refusedSearchPeriod}
        loadError={loadError}
        onRetryLoad={retryLoad}
        pricingFailed={pricingFailed}
        onRetryPricing={retryPricing}
        depositWhenInsured={listing?.priceDetails.securityDepositWhenInsured}
        /* The offer's own handover where the vendor stated one; the base's is shared by every
           fleet at the marina and can be another operator's. */
        checkInTime={quote?.checkInTime ?? listing?.base.checkInTime}
        checkOutTime={quote?.checkOutTime ?? listing?.base.checkOutTime}
        extraRates={listing ? [...listing.mandatoryExtras, ...listing.optionalExtras] : undefined}
        crewType={crewType}
        crewOptions={crewOptions}
        onCrewChange={setCrew}
        onDropOffChange={actions ? setDropOff : undefined}
        guests={guests}
        onGuestsChange={setGuests}
        unavailable={listing ? !listing.availability.hasAvailableDates : false}
        /* The same rule the search card uses for "On request", so the two agree:
           free dates, but no published rate to open a season with. */
        datesOnRequest={
          listing
            ? listing.availability.hasAvailableDates &&
              listing.availability.bookablePeriod === null &&
              listing.availability.nextPeriod === null
            : false
        }
        actions={actions}
        shaded={shaded}
        payNowHref={payNowHref}
        /* Every reprice mints a new quote id. Once Confirm has held a booking against one,
           the held booking is what the customer pays, so the code can no longer change. */
        onApplyPromo={quote && !bookingId ? applyPromo : undefined}
        /* Same rule as the promo code: once Confirm has held a booking, the amount is fixed
           and the credit that backs it has already been counted against the balance. */
        onApplyCredit={quote && !bookingId ? applyCredit : undefined}
        onRequestQuote={actions ? () => setQuoteRequestOpen(true) : undefined}
        onRequestBooking={actions && confirmsByHand ? () => setBookingRequestOpen(true) : undefined}
      />
      {actions ? (
        <>
          <QuoteRequestDialog open={quoteRequestOpen} onOpenChange={setQuoteRequestOpen} />
          <QuoteRequestDialog
            kind="booking_request"
            open={bookingRequestOpen}
            onOpenChange={setBookingRequestOpen}
          />
        </>
      ) : null}
    </>
  );
}
