"use client";

import { ORPCError } from "@orpc/client";
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

import {
  type CrewType,
  slotKey,
  type WeekSlot,
} from "@/components/shared/data-display/booking-summary";
import { useListingDetail } from "@/features/yachts";
import { dayFromNative } from "@/lib/date";

import { availabilityCalendarQueryOptions, type Quote } from "../api/queries";
import { useQuote } from "../hooks/use-quote";

/**
 * The vendor refusing a period comes back as CONFLICT. Synthesized slots are our own
 * guess, so this is an expected answer rather than a failure, and the caller narrows
 * the picker instead of surfacing an error page.
 */
function isSlotConflict(error: Error): boolean {
  return error instanceof ORPCError && error.code === "CONFLICT";
}

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
  /** The last selection was refused by the provider; the sidebar asks for another date. */
  slotError: boolean;
  selectSlot: (key: string) => void;
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

  /*
   * Periods a live quote refused. A synthesized slot is our inference, so the vendor
   * is the only authority — once it says no, the option stays disabled for the visit
   * rather than inviting the same 409 again.
   *
   * Confirmation alone is too strict a gate: the confirming pass runs on a wall-clock
   * budget and reaches a fraction of the fleet, so most sellable weeks never carry one.
   * A price is the weaker but far broader signal — the vendor published a rate for that
   * period, which it does not do for a season it has not opened. Unconfirmed AND
   * unpriced is the combination with nothing behind it.
   */
  const [refusedSlots, setRefusedSlots] = useState<ReadonlySet<string>>(new Set());
  const [slotError, setSlotError] = useState(false);

  const slots: WeekSlot[] = useMemo(
    () =>
      (calendar?.slots ?? [])
        .filter((slot) => slot.status === "available")
        .map((slot) => ({
          checkIn: slot.startDate,
          checkOut: slot.endDate,
          priceMinor: slot.price?.amountMinor ?? null,
          bookable:
            (slot.availabilityConfirmed || slot.price !== undefined) &&
            !refusedSlots.has(slotKey({ checkIn: slot.startDate, checkOut: slot.endDate })),
        })),
    [calendar, refusedSlots],
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

  function selectSlot(key: string) {
    const slot = slots.find((entry) => slotKey(entry) === key);
    if (!slot || !slot.bookable) return;
    const dates = { checkIn: slot.checkIn, checkOut: slot.checkOut };
    setSlotError(false);
    void (quote ? repriceWith(dates) : quoteFor({ ...dates, guests, crewType })).catch(
      (error: Error) => {
        if (!isSlotConflict(error)) throw error;
        setRefusedSlots((current) => new Set(current).add(key));
        setSlotError(true);
      },
    );
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
    slotError,
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
