"use client";

import { useQuery } from "@tanstack/react-query";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import BookingSummary, {
  type CrewType,
  type WeekSlot,
} from "@/components/shared/data-display/booking-summary";
import type { AppPathname } from "@/i18n/navigation";
import { useListingDetail } from "@/features/yachts";
import { dayFromNative } from "@/lib/date";

import { availabilityCalendarQueryOptions } from "../api/queries";
import { useQuote } from "../hooks/use-quote";
import { serializeBooking } from "../lib/search-params";

const DEFAULT_GUESTS = 2;
const CALENDAR_MONTHS = 6;
const REPRICE_DEBOUNCE_MS = 400;

/*
 * The booking sidebar for both surfaces of the quote spine.
 *
 * On the detail page (no `quoteId`) it offers the listing's available weekly slots and mints a quote
 * from the chosen one; in the wizard (`quoteId` from the URL) it loads that quote and revalidates the
 * price on entry. Charters sell in fixed Sat→Sat weeks, so the date control is a slot picker, not a
 * free range — a range the provider cannot honour just fails the quote. `useListingDetail` reads
 * `[id]` from the route; the quote keys on the canonical `listing.id`, the Pay Now href on the slug.
 */
export default function BookingSidebar({
  quoteId,
  actions = true,
  shaded = false,
}: {
  quoteId?: string | null;
  actions?: boolean;
  shaded?: boolean;
}) {
  const { id: slug } = useParams<{ id: string }>();
  const { data: listing } = useListingDetail();
  const listingId = listing?.id ?? "";
  const { quote, quoteFor, load, repriceWith, isPending } = useQuote(listingId);

  const [crewChoice, setCrewChoice] = useState<CrewType | undefined>();
  const [guests, setGuests] = useState(DEFAULT_GUESTS);

  /*
   * Defaulted here, not in an effect: the listing is prefetched, so its first crew option is known
   * on the first render, which keeps the Select controlled from the start — a value that only
   * arrives in an effect leaves Base UI treating the Select as uncontrolled and never showing it.
   */
  const crewType = crewChoice ?? listing?.crew.options[0];

  const calWindow = useMemo(() => {
    const from = startOfMonth(new Date());
    return { from: dayFromNative(from), to: dayFromNative(endOfMonth(addMonths(from, CALENDAR_MONTHS))) };
  }, []);

  const { data: calendar } = useQuery({
    ...availabilityCalendarQueryOptions({
      listingId,
      from: calWindow.from,
      to: calWindow.to,
      currency: "EUR",
    }),
    enabled: Boolean(listingId),
  });

  const slots: WeekSlot[] = useMemo(
    () =>
      (calendar?.slots ?? [])
        .filter((slot) => slot.status === "available")
        .map((slot) => ({
          checkIn: slot.startDate,
          checkOut: slot.endDate,
          priceMinor: slot.price?.amountMinor ?? 0,
        })),
    [calendar],
  );

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current || !quoteId) return;
    loadedRef.current = true;
    void load(quoteId);
  }, [quoteId, load]);

  useEffect(() => {
    if (!quote) return;
    setGuests(quote.guests);
    if (quote.crewType) setCrewChoice(quote.crewType);
  }, [quote]);

  function selectSlot(checkIn: string) {
    const slot = slots.find((entry) => entry.checkIn === checkIn);
    if (!slot) return;
    const dates = { checkIn: slot.checkIn, checkOut: slot.checkOut };
    void (quote ? repriceWith(dates) : quoteFor({ ...dates, guests, crewType }));
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const payNowHref =
    actions && quote
      ? (serializeBooking(`/yachts/${slug}/booking`, { quoteId: quote.quoteId }) as AppPathname)
      : undefined;

  return (
    <BookingSummary
      quote={quote}
      loading={isPending}
      stats={
        listing
          ? { booked: listing.bookingStats.bookedThisMonth, viewed: listing.bookingStats.viewedToday }
          : null
      }
      slots={slots}
      selectedCheckIn={quote?.checkIn}
      onSlotChange={selectSlot}
      crewType={crewType}
      crewOptions={listing?.crew.options ?? []}
      onCrewChange={(next) => {
        setCrewChoice(next);
        if (quote) void repriceWith({ crewType: next });
      }}
      guests={guests}
      onGuestsChange={(next) => {
        setGuests(next);
        if (!quote) return;
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void repriceWith({ guests: next }), REPRICE_DEBOUNCE_MS);
      }}
      actions={actions}
      shaded={shaded}
      payNowHref={payNowHref}
    />
  );
}
