"use client";

import BookingSummary from "@/components/shared/data-display/booking-summary";
import type { AppPathname } from "@/i18n/navigation";
import { useState } from "react";

import { serializeBooking } from "../lib/search-params";
import { useBooking } from "./booking-provider";
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
    constraints,
    crewType,
    crewOptions,
    guests,
    isPending,
    slotError,
    selectPeriod,
    setCrew,
    setGuests,
  } = useBooking();
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);

  /* SAFETY: /yachts/[id]/booking is a real route; typedRoutes only recognises it when the
     segment is a literal, and nuqs serializes the query string back to a plain string. */
  const payNowHref =
    actions && quote
      ? (serializeBooking(`/yachts/${slug}/booking`, { quoteId: quote.quoteId }) as AppPathname)
      : undefined;

  return (
    <>
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
        constraints={constraints}
        selectedPeriod={quote ? { checkIn: quote.checkIn, checkOut: quote.checkOut } : undefined}
        onPeriodSelect={selectPeriod}
        slotError={slotError}
        crewType={crewType}
        crewOptions={crewOptions}
        onCrewChange={setCrew}
        guests={guests}
        onGuestsChange={setGuests}
        unavailable={listing ? !listing.availability.hasAvailableDates : false}
        actions={actions}
        shaded={shaded}
        payNowHref={payNowHref}
        onRequestQuote={actions ? () => setQuoteRequestOpen(true) : undefined}
      />
      {actions ? (
        <QuoteRequestDialog open={quoteRequestOpen} onOpenChange={setQuoteRequestOpen} />
      ) : null}
    </>
  );
}
