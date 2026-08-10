"use client";

import { useQuery } from "@tanstack/react-query";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { useParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CrewType, WeekSlot } from "@/components/shared/data-display/booking-summary";
import { useListingDetail } from "@/features/yachts";
import { dayFromNative } from "@/lib/date";

import { availabilityCalendarQueryOptions, type Quote } from "../api/queries";
import { useQuote } from "../hooks/use-quote";

const DEFAULT_GUESTS = 2;
const CALENDAR_MONTHS = 6;
const REPRICE_DEBOUNCE_MS = 400;

type ListingDetail = ReturnType<typeof useListingDetail>["data"];

type BookingContextValue = {
  /** Route slug (the Pay Now / back links use it); the quote keys on the canonical `listing.id`. */
  slug: string;
  listing: ListingDetail;
  quote: Quote | null;
  slots: WeekSlot[];
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  guests: number;
  isPending: boolean;
  selectSlot: (checkIn: string) => void;
  setCrew: (next: CrewType) => void;
  setGuests: (next: number) => void;
  /** Step 2 hands its selection here — reprices the current quote's extras in place. */
  setExtras: (extras: string[]) => void;
  /** The held booking, set by `createHold` at Confirm; the payment step and confirmation key on it. */
  bookingId: string | null;
  setBookingId: (id: string | null) => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

/*
 * Owns the one quote both surfaces of the booking flow share. The detail page wraps only the
 * sidebar; the wizard wraps the sidebar and the steps together, so Extras can reprice and Review
 * can read the same live quote. Charters sell in fixed weekly slots, so the date control is a slot
 * picker; the quote keys on `listing.id`, never the URL slug.
 */
export function BookingProvider({
  quoteId,
  children,
}: {
  quoteId?: string | null;
  children: ReactNode;
}) {
  const { id: slug } = useParams<{ id: string }>();
  const { data: listing } = useListingDetail();
  const listingId = listing?.id ?? "";
  const { quote, quoteFor, load, repriceWith, isPending } = useQuote(listingId);

  const [crewChoice, setCrewChoice] = useState<CrewType | undefined>();
  const [guests, setGuestsState] = useState(DEFAULT_GUESTS);
  const [bookingId, setBookingId] = useState<string | null>(null);
  /* Defaulted synchronously off the prefetched listing so the crew Select stays controlled. */
  const crewType = crewChoice ?? listing?.crew.options[0];

  const calWindow = useMemo(() => {
    const from = startOfMonth(new Date());
    return {
      from: dayFromNative(from),
      to: dayFromNative(endOfMonth(addMonths(from, CALENDAR_MONTHS))),
    };
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
    setGuestsState(quote.guests);
    if (quote.crewType) setCrewChoice(quote.crewType);
  }, [quote]);

  function selectSlot(checkIn: string) {
    const slot = slots.find((entry) => entry.checkIn === checkIn);
    if (!slot) return;
    const dates = { checkIn: slot.checkIn, checkOut: slot.checkOut };
    void (quote ? repriceWith(dates) : quoteFor({ ...dates, guests, crewType }));
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function setCrew(next: CrewType) {
    setCrewChoice(next);
    if (quote) void repriceWith({ crewType: next });
  }

  function setGuests(next: number) {
    setGuestsState(next);
    if (!quote) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void repriceWith({ guests: next }), REPRICE_DEBOUNCE_MS);
  }

  function setExtras(extras: string[]) {
    if (quote) void repriceWith({ extras });
  }

  const value: BookingContextValue = {
    slug,
    listing,
    quote,
    slots,
    crewType,
    crewOptions: listing?.crew.options ?? [],
    guests,
    isPending,
    selectSlot,
    setCrew,
    setGuests,
    setExtras,
    bookingId,
    setBookingId,
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking must be used within <BookingProvider>");
  return value;
}
