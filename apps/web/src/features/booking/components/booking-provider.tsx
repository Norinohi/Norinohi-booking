"use client";

import { useParams } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";

import type { OfferConstraints } from "@yacht-charter/api/lib/offer-availability";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import { useListingDetail } from "@/features/yachts";

import type { Quote } from "../api/queries";
import { useOfferConstraints } from "../hooks/use-offer-constraints";
import { useQuote } from "../hooks/use-quote";
import { useQuoteLoad } from "../hooks/use-quote-load";
import { useQuotePricing } from "../hooks/use-quote-pricing";
import { useQuoteSelection } from "../hooks/use-quote-selection";
import { useSearchedPeriod } from "../hooks/use-searched-period";
import type { CrewType, ListingDetail } from "../types";

type BookingContextValue = {
  /** Route slug (the Pay Now / back links use it); the quote keys on the canonical `listing.id`. */
  slug: string;
  listing: ListingDetail;
  quote: Quote | null;
  /** What each vendor will sell, kept apart so the calendar can answer across them. */
  offers: readonly OfferConstraints[];
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  guests: number;
  isPending: boolean;
  /** The last selection was refused by the provider; the sidebar asks for another date. */
  slotError: boolean;
  /*
   * The period carried in from search or a shared link, when this listing will not sell it.
   * Distinct from `slotError`, which is a period the visitor picked here being refused: this
   * one was already chosen before they arrived, and dropping it in silence is what left the
   * panel reading "Select dates" as though they had never named any.
   */
  refusedSearchPeriod: CharterPeriod | null;
  /**
   * The quote named in the URL could not be read. Distinct from `slotError`, which is the
   * provider declining a period: this is the wizard unable to show anything at all.
   */
  loadError: boolean;
  /** Asks for the URL's quote again after `loadError`. */
  retryLoad: () => void;
  selectPeriod: (period: CharterPeriod) => void;
  setCrew: (next: CrewType) => void;
  /**
   * Where the charter finishes, for a fleet that sells one-way. Null returns the yacht to the
   * base it left from, which is what a charter does unless someone says otherwise.
   */
  setDropOff: (endBaseId: string | null) => void;
  setGuests: (next: number) => void;
  /** The optional extras currently on the quote, so a checkbox can read its own state. */
  extras: readonly string[];
  /** A list edited by hand — debounced, so a burst of ticks is one reprice rather than four. */
  selectExtras: (extras: string[]) => void;
  /** Commits a selection now and waits for the quote, for a step that is being left. */
  setExtras: (extras: string[]) => Promise<void>;
  /**
   * Extras the customer is asking the base for, which no vendor sells through us. They cost
   * nothing and appear on no line, so a tick here changes the quote's record of what was asked
   * and not its price; `createHold` writes them into the booking's special requests.
   */
  requestedExtras: readonly string[];
  requestExtras: (extras: string[]) => void;
  /** Commits the asked-for list now and waits for the quote, the way `setExtras` does. */
  setRequestedExtras: (extras: string[]) => Promise<void>;
  /** Applies a promo code to the live quote, or clears it with `null`. */
  applyPromo: (code: string | null) => void;
  /** Spends the caller's referral credit on the live quote, or takes it back off. */
  applyCredit: (spend: boolean) => void;
  /** The held booking, set by `createHold` at Confirm; the payment step and confirmation key on it. */
  bookingId: string | null;
  setBookingId: (id: string | null) => void;
  /** When the provider releases the option `createHold` took; null where none was held. */
  holdExpiresAt: string | null;
  setHoldExpiresAt: (at: string | null) => void;
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
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);

  const searchedPeriod = useSearchedPeriod();
  const { offers, constraintsLoaded, suggestedPeriod, refusePeriod } = useOfferConstraints(
    listing,
    searchedPeriod?.checkOut,
  );

  /* Here rather than in either hook: the URL quote's load and a priced period both learn of a refusal. */
  const [slotError, setSlotError] = useState(false);
  const { loadError, retryLoad } = useQuoteLoad(quoteId, quote, load, setSlotError);

  const {
    crewType,
    guests,
    extras,
    requestedExtras,
    setCrew,
    setDropOff,
    setGuests,
    selectExtras,
    setExtras,
    requestExtras,
    setRequestedExtras,
    applyPromo,
    applyCredit,
  } = useQuoteSelection(listing, quote, repriceWith);

  const { refusedSearchPeriod, selectPeriod } = useQuotePricing({
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
  });

  const value: BookingContextValue = {
    slug,
    listing,
    quote,
    offers,
    crewType,
    crewOptions: listing?.crew.options ?? [],
    guests,
    isPending,
    slotError,
    refusedSearchPeriod,
    loadError,
    retryLoad,
    selectPeriod,
    setCrew,
    setDropOff,
    setGuests,
    extras,
    requestedExtras,
    requestExtras,
    setRequestedExtras,
    selectExtras,
    setExtras,
    applyPromo,
    applyCredit,
    bookingId,
    setBookingId,
    holdExpiresAt,
    setHoldExpiresAt,
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking must be used within <BookingProvider>");
  return value;
}
