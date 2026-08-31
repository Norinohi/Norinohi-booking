"use client";

import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, startOfMonth } from "date-fns";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DatePeriod } from "@yacht-charter/api/lib/availability-rules";
import {
  combinedFirstBookablePeriod,
  combinedRangeStatus,
  type OfferConstraints,
} from "@yacht-charter/api/lib/offer-availability";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import type { CrewType } from "@/components/shared/data-display/booking-summary";
import { useListingDetail } from "@/features/yachts";
import { detailPeriodParsers } from "@/features/yachts/lib/search-params";

import { dayFromNative, dayToNative } from "@/lib/date";

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
const REPRICE_DEBOUNCE_MS = 400;

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

type ListingDetail = ReturnType<typeof useListingDetail>["data"];

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
  /** Applies a promo code to the live quote, or clears it with `null`. */
  applyPromo: (code: string | null) => void;
  /** Spends the caller's referral credit on the live quote, or takes it back off. */
  applyCredit: (spend: boolean) => void;
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
  const [extras, setExtrasState] = useState<string[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(null);
  /* Defaulted synchronously off the prefetched listing so the crew Select stays controlled. */
  const crewType = crewChoice ?? listing?.crew.options[0];

  /*
   * The charter the visitor already searched for, handed over by the result card they clicked.
   * Without it the sidebar opened on an empty calendar and made them pick the same week twice.
   */
  const [carried] = useQueryStates(detailPeriodParsers);
  const searchedPeriod =
    carried.checkIn && carried.checkOut
      ? { checkIn: carried.checkIn, checkOut: carried.checkOut }
      : null;
  const searchedCheckOut = searchedPeriod?.checkOut;
  /* The listing's own first sellable charter, which the undated result card shows as its dates. */
  const bookablePeriod = listing?.availability.bookablePeriod ?? null;
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
      currency: "EUR",
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
  const [refusedPeriods, setRefusedPeriods] = useState<
    readonly (DatePeriod & { offerId: string })[]
  >([]);
  const [slotError, setSlotError] = useState(false);

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
        refused: [
          ...offer.refused,
          ...refusedPeriods.filter((period) => period.offerId === offer.offerId),
        ],
      })),
    [published, refusedPeriods],
  );

  const [loadError, setLoadError] = useState(false);
  /*
   * Bumped by `retryLoad`, which is the whole mechanism: the effect keys on it, so asking again
   * is a re-run of the one load path rather than a second one that could drift from it.
   */
  const [loadAttempt, setLoadAttempt] = useState(0);
  /*
   * Which (quote, attempt) has already been sent, rather than a bare "have we loaded" flag.
   *
   * The flag could only ever be set, never cleared, so a single refused read - a restarted dev
   * server, a slow vendor, a stale id - left the sidebar on its "select dates" empty state for
   * the rest of the visit: nothing retried, nothing was shown, and the rejection surfaced only
   * as an uncaught promise in the console. Clearing it in the catch is not the fix either:
   * `load` is redefined every render, so the effect re-runs on the re-render that recording the
   * failure causes, and a cleared flag turns that into an endless retry loop against the same
   * dead quote. Keying on the attempt is what makes "once per ask" precise.
   */
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!quoteId) return;
    const attempt = `${quoteId}#${loadAttempt}`;
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;

    setLoadError(false);
    load(quoteId).catch(() => setLoadError(true));
  }, [quoteId, load, loadAttempt]);

  function retryLoad() {
    setLoadAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    if (!quote) return;
    setGuestsState(quote.guests);
    if (quote.crewType) setCrewChoice(quote.crewType);
    /*
     * The selection is whatever the quote priced, read back off its optional lines
     * rather than remembered separately. Two things fall out of that: the wizard,
     * which arrives with only a `quoteId` and no memory of what was ticked on the
     * listing, shows the right boxes; and an extra the offer stopped carrying — a
     * changed date, usually — drops out on its own instead of standing ticked over
     * a charge that will never appear.
     */
    setExtrasState(
      quote.lines.filter((line) => line.group === "optional").map((line) => line.code),
    );
  }, [quote]);

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

  /*
   * Prices that period once, as soon as the published constraints are in — before them every
   * range reads as season-closed, since `priced` is what opens a season. Only on the detail
   * page: the wizard arrives with `quoteId` and loads that quote instead. A period the listing
   * will not sell is left alone rather than reported, because the visitor did not ask for this
   * boat on these dates so much as arrive at it, and the calendar is already open.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || quoteId || !published || !listingId) return;
    const period = searchedPeriod ?? suggestedPeriod;
    if (!period) return;
    if (combinedRangeStatus(period.checkIn, period.checkOut, offers).verdict !== "bookable") return;
    seededRef.current = true;
    selectPeriod(period);
  });

  function selectPeriod(period: CharterPeriod) {
    /* The verdict names the offer that would sell it, which is the one a refusal belongs to. */
    const verdict = combinedRangeStatus(period.checkIn, period.checkOut, offers);
    if (verdict.verdict !== "bookable") return;
    const refusedBy = verdict.offerId;
    setSlotError(false);
    void (quote ? repriceWith(period) : quoteFor({ ...period, guests, crewType, extras })).catch(
      (error: Error) => {
        if (!isSlotConflict(error)) throw error;
        if (refusedBy !== null) {
          setRefusedPeriods((current) => [
            ...current,
            { offerId: refusedBy, startDate: period.checkIn, endDate: period.checkOut },
          ]);
        }
        setSlotError(true);
      },
    );
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function setCrew(next: CrewType) {
    setCrewChoice(next);
    if (quote) void repriceWith({ crewType: next });
  }

  /*
   * Re-prices rather than adjusting a total, because a one-way is a different charter: the
   * vendor quotes it as its own offer with its own directional fee, and only it knows which
   * pairings it will sell that week.
   */
  function setDropOff(endBaseId: string | null) {
    if (quote) void repriceWith({ endBaseId });
  }

  function setGuests(next: number) {
    setGuestsState(next);
    if (!quote) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void repriceWith({ guests: next }), REPRICE_DEBOUNCE_MS);
  }

  /*
   * Awaited by its callers, unlike the other controls. The extras step commits once
   * on Continue rather than on every checkbox, and Confirm may commit them too, so a
   * caller has to be able to wait for the superseding quote before holding against it.
   */
  const extrasDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** What the live quote actually priced, which is what a reprice would have to change. */
  const pricedExtras = () =>
    quote?.lines.filter((line) => line.group === "optional").map((line) => line.code) ?? [];

  const sameSelection = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

  /*
   * Every hand-edited extras list, on the listing and in the wizard alike. The box has to
   * answer immediately, so the selection moves now and the reprice follows on the same
   * debounce the guest slider uses: ticking three extras is one reprice, not three superseded
   * quotes. The wizard used to defer this to its Continue instead, which is why its sidebar
   * sat on a total that did not match the boxes beside it.
   */
  function selectExtras(next: string[]) {
    setExtrasState(next);
    if (!quote) return;
    clearTimeout(extrasDebounceRef.current);
    extrasDebounceRef.current = setTimeout(
      () => void repriceWith({ extras: next }),
      REPRICE_DEBOUNCE_MS,
    );
  }

  /*
   * The same edit, committed rather than previewed: a step being left has to know the quote it
   * is leaving behind. Cancels any pending debounce so a stale timer cannot supersede the quote
   * this just minted, and does nothing at all when the live quote already priced this exact
   * selection — leaving a step normally means the debounce has already landed.
   */
  async function setExtras(next: string[]) {
    clearTimeout(extrasDebounceRef.current);
    setExtrasState(next);
    if (!quote || sameSelection(pricedExtras(), next)) return;
    await repriceWith({ extras: next });
  }

  /*
   * Reprice carries the previous quote's code forward when `discountCode` is omitted, so this
   * is the only place it moves: a code passed here sticks across every later date, guest and
   * extras change, and `null` is what removes it.
   */
  function applyPromo(code: string | null) {
    if (quote) void repriceWith({ discountCode: code });
  }

  /*
   * Carried forward the same way a code is: reprice keeps the previous quote's choice when
   * `applyCredit` is omitted, so credit survives every later date, guest and extras change.
   * How much is actually spendable is the server's call, not this one's.
   */
  function applyCredit(spend: boolean) {
    if (quote) void repriceWith({ applyCredit: spend });
  }

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
    loadError,
    retryLoad,
    selectPeriod,
    setCrew,
    setDropOff,
    setGuests,
    extras,
    selectExtras,
    setExtras,
    applyPromo,
    applyCredit,
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
