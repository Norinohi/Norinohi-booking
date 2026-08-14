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

import type { CharterConstraints, DatePeriod } from "@yacht-charter/api/lib/availability-rules";
import { rangeStatus } from "@yacht-charter/api/lib/availability-rules";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import type { CrewType } from "@/components/shared/data-display/booking-summary";
import { useListingDetail } from "@/features/yachts";
import { dayFromNative } from "@/lib/date";

import { availabilityConstraintsQueryOptions, type Quote } from "../api/queries";
import { useQuote } from "../hooks/use-quote";

/**
 * The vendor refusing a period comes back as CONFLICT. Availability is inferred from
 * occupancy, so this is an expected answer rather than a failure, and the caller narrows
 * the calendar instead of surfacing an error page.
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
  constraints: CharterConstraints;
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  guests: number;
  isPending: boolean;
  /** The last selection was refused by the provider; the sidebar asks for another date. */
  slotError: boolean;
  selectPeriod: (period: CharterPeriod) => void;
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
 * can read the same live quote. The date control decides from the listing's published constraints
 * rather than from pre-cut periods; the quote keys on `listing.id`, never the URL slug.
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

  const { data: published } = useQuery({
    ...availabilityConstraintsQueryOptions({
      listingId,
      from: calWindow.from,
      to: calWindow.to,
      currency: "EUR",
    }),
    enabled: Boolean(listingId),
  });

  /*
   * Periods a live quote refused. The constraints are what the provider published, and a
   * refusal is it correcting them, so the period stays out for the rest of the visit rather
   * than inviting the same 409 again.
   */
  const [refusedPeriods, setRefusedPeriods] = useState<readonly DatePeriod[]>([]);
  const [slotError, setSlotError] = useState(false);

  /*
   * A period the vendor refused stays refused — it said no and it is the authority — but only
   * that period. Adding it to `occupied` made the calendar infer the days were taken, which
   * blocked every overlapping range without ever asking: refuse a fortnight from a Saturday
   * and the free week starting the same day vanished with it.
   */
  const constraints: CharterConstraints = useMemo(
    () => ({
      rules: published?.rules ?? [],
      occupied: published?.occupied ?? [],
      priced: published?.priced ?? [],
      refused: refusedPeriods,
    }),
    [published, refusedPeriods],
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

  function selectPeriod(period: CharterPeriod) {
    if (rangeStatus(period.checkIn, period.checkOut, constraints) !== "bookable") return;
    setSlotError(false);
    void (quote ? repriceWith(period) : quoteFor({ ...period, guests, crewType })).catch(
      (error: Error) => {
        if (!isSlotConflict(error)) throw error;
        setRefusedPeriods((current) => [
          ...current,
          { startDate: period.checkIn, endDate: period.checkOut },
        ]);
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
    constraints,
    crewType,
    crewOptions: listing?.crew.options ?? [],
    guests,
    isPending,
    slotError,
    selectPeriod,
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
