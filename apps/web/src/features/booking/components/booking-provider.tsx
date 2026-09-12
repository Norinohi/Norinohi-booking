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
  const [requestedExtras, setRequestedExtrasState] = useState<string[]>([]);
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
  /*
   * The currency the card quoted, which the panel has to answer in. Undefined until the listing
   * loads, and nothing is quoted before then, so the request never falls back to the default.
   */
  const listingCurrency =
    listing?.priceFrom?.currency ?? listing?.priceDetails.securityDeposit?.currency;
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
  const [refusedSearchPeriod, setRefusedSearchPeriod] = useState<CharterPeriod | null>(null);

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
    /*
     * The URL's id is read once, to enter the wizard with. After that this page holds the live
     * quote and the URL follows it (`QuoteUrlSync`), never the other way round.
     *
     * Matching the ids instead was an endless loop, because the two move a render apart: a
     * reprice adopts its replacement before the URL has caught up, so for one render the live
     * quote was ahead of the prop, this fired against the id the reprice had just superseded,
     * and that load minted another quote for the URL to chase. One tick in Extras put the
     * wizard into a permanent reprice, a fresh `quoteId` every 400ms, and a sidebar that never
     * came out of its skeletons. `retryLoad` is unaffected: it only runs where the load failed,
     * and there is no quote then.
     */
    if (quote) return;
    const attempt = `${quoteId}#${loadAttempt}`;
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;

    setLoadError(false);
    load(quoteId).catch((error: Error) => {
      /*
       * A vendor refusing the quote's own period is not this page failing to load.
       *
       * Reloading a checkout re-prices its quote live, so a week booked away from us since it
       * was quoted comes back here as a CONFLICT -- and every one of them read as "We couldn't
       * load this booking's price", above a Try again that asks the vendor the same question
       * and gets the same no. The visitor was told we were broken about a boat that was simply
       * sold, and handed the one control that cannot help.
       *
       * `slotError` is the answer the listing page already gives to exactly this refusal, and
       * it points at the date picker, which is the control that can. The picker reads the
       * published constraints rather than the quote, so it is usable with no quote at all.
       */
      if (isSlotConflict(error)) {
        setSlotError(true);
        return;
      }
      setLoadError(true);
    });
  }, [quoteId, quote, load, loadAttempt]);

  function retryLoad() {
    setLoadAttempt((attempt) => attempt + 1);
  }

  /*
   * The edit a control has made but no quote has answered yet, per list.
   *
   * The read-back below is the quote's answer overwriting the boxes, which is right for every
   * quote that has seen the edit and wrong for any that has not: a guest-slider reprice landing
   * between a tick and its own reprice carried the server's older list back, and the box the
   * customer had just ticked went off under their hand. Held until the call that carries the
   * edit settles, whichever way it settles - a refused selection is exactly when the quote
   * should be allowed to correct the boxes.
   */
  const pendingExtrasRef = useRef<readonly string[] | null>(null);
  const pendingRequestedRef = useRef<readonly string[] | null>(null);

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
    if (!pendingExtrasRef.current) {
      setExtrasState(
        quote.lines.filter((line) => line.group === "optional").map((line) => line.code),
      );
    }
    /* Read back from the quote for the same reason, except that these have no line to be read
       off: nothing prices them, so the quote carries the list itself. */
    if (!pendingRequestedRef.current) setRequestedExtrasState(quote.requestedExtras);
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
    /*
     * `quote` is in the guard beside the id, because the id is only the usual reason there is
     * already a price on screen and not the whole of it. This effect has no dependency list on
     * purpose - it re-reads its own conditions every render - so a render where the URL has no
     * `quoteId` is enough to run it, and a mounted wizard can reach one: any navigation that
     * drops the parameter while the page stays alive. It then minted a second, bare quote over
     * a live one, taking the extras, promo and credit off the sidebar with it.
     */
    if (seededRef.current || quoteId || quote || !published || !listingId) return;
    const period = searchedPeriod ?? suggestedPeriod;
    if (!period) return;

    if (combinedRangeStatus(period.checkIn, period.checkOut, offers).verdict !== "bookable") {
      /*
       * A period the page guessed is still dropped in silence, for the reason `pricePeriod`
       * gives. One the visitor carried in is not: they asked for these dates, and the panel
       * falling back to "Select dates" with nothing said reads as a broken picker. It is also
       * the only signal for a window our synced calendar still calls free while the vendor no
       * longer does, which no amount of filtering in search can predict.
       */
      if (!searchedPeriod) return;
      setRefusedSearchPeriod(searchedPeriod);

      /* Open on something sellable rather than on nothing, so the answer comes with an offer. */
      if (
        suggestedPeriod &&
        combinedRangeStatus(suggestedPeriod.checkIn, suggestedPeriod.checkOut, offers).verdict ===
          "bookable"
      ) {
        seededRef.current = true;
        pricePeriod(suggestedPeriod, { report: false });
      }
      return;
    }

    seededRef.current = true;
    pricePeriod(period, { report: false });
  });

  function selectPeriod(period: CharterPeriod) {
    /*
     * The notice names the period carried in from search, so it is answered the moment the
     * visitor picks their own: left standing beside a freshly chosen October week it reads as
     * a complaint about the dates now on screen rather than the ones they arrived with.
     */
    setRefusedSearchPeriod(null);
    pricePeriod(period, { report: true });
  }

  /*
   * `report` is what separates the visitor's own click from the period this page opened itself
   * on. Both record the refusal, because the vendor turning a period down is the same fact
   * either way and the calendar has to retire it. Only the click says so out loud: the seeded
   * period is a guess made from the read model, and answering an arrival with "those dates are
   * not bookable" blames the visitor for dates they never picked.
   *
   * Quiet for the visitor is not the same as quiet for us, and this used to be both. A seeded
   * quote that failed left the sidebar on "select your dates to see the price" and said
   * nothing anywhere: a NauSYS mapping bug made every date on one listing unquotable for as
   * long as it was live, and the only symptom was an empty panel. Anything that is not the
   * vendor declining these exact dates is written to the console with the listing and the
   * period, whoever asked. The server names the same failure on its side; see `reportRefusal`
   * in packages/api/src/services/quote.ts.
   */
  function pricePeriod(period: CharterPeriod, { report }: { report: boolean }) {
    /* The verdict names the offer that would sell it, which is the one a refusal belongs to. */
    const verdict = combinedRangeStatus(period.checkIn, period.checkOut, offers);
    if (verdict.verdict !== "bookable") return;
    const refusedBy = verdict.offerId;
    setSlotError(false);
    void (
      quote
        ? repriceWith(period)
        : quoteFor({
            ...period,
            guests,
            crewType,
            extras,
            requestedExtras,
            currency: listingCurrency,
          })
    ).catch((error: Error) => {
      const dates = `${period.checkIn}..${period.checkOut}`;
      if (!isSlotConflict(error)) {
        /*
         * Logged rather than rethrown. The throw landed in a promise nobody awaited, so it
         * surfaced as an unhandled rejection with no listing, no dates and no stack worth
         * reading - which is how a broken listing looked like a quiet one.
         */
        console.error(`[booking] pricing ${slug} ${dates} failed`, error);
        if (report) setSlotError(true);
        return;
      }

      if (refusedBy !== null) {
        setRefusedPeriods((current) => [
          ...current,
          { offerId: refusedBy, startDate: period.checkIn, endDate: period.checkOut },
        ]);
      }
      /* A refusal of the dates this page chose for itself is worth one line, not a banner. */
      if (report) setSlotError(true);
      else console.warn(`[booking] ${slug} opened on ${dates}, which the vendor refused`);
    });
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
    pendingExtrasRef.current = next;
    clearTimeout(extrasDebounceRef.current);
    extrasDebounceRef.current = setTimeout(() => void commitExtras(next), REPRICE_DEBOUNCE_MS);
  }

  /** One reprice for one edit, and the edit stops being pending once that reprice has answered. */
  async function commitExtras(next: readonly string[]) {
    try {
      await repriceWith({ extras: [...next] });
    } finally {
      if (pendingExtrasRef.current === next) pendingExtrasRef.current = null;
    }
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
    if (!quote || sameSelection(pricedExtras(), next)) {
      pendingExtrasRef.current = null;
      return;
    }
    pendingExtrasRef.current = next;
    await commitExtras(next);
  }

  /*
   * The same debounce, on the list that is not priced. Kept apart from `selectExtras` rather
   * than folded into it because the two answer different questions and a reprice that carried
   * both would let a mistake in either one refuse the other: a code the catalogue stopped
   * offering rejects the whole call.
   */
  const requestDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function requestExtras(next: string[]) {
    setRequestedExtrasState(next);
    if (!quote) return;
    pendingRequestedRef.current = next;
    clearTimeout(requestDebounceRef.current);
    requestDebounceRef.current = setTimeout(
      () => void commitRequestedExtras(next),
      REPRICE_DEBOUNCE_MS,
    );
  }

  async function commitRequestedExtras(next: readonly string[]) {
    try {
      await repriceWith({ requestedExtras: [...next] });
    } finally {
      if (pendingRequestedRef.current === next) pendingRequestedRef.current = null;
    }
  }

  /*
   * The flush, for a step being left inside the debounce window. Compared against the quote's
   * own list rather than a priced line, because nothing prices these.
   */
  async function setRequestedExtras(next: string[]) {
    clearTimeout(requestDebounceRef.current);
    setRequestedExtrasState(next);
    if (!quote || sameSelection(quote.requestedExtras, next)) {
      pendingRequestedRef.current = null;
      return;
    }
    pendingRequestedRef.current = next;
    await commitRequestedExtras(next);
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
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking must be used within <BookingProvider>");
  return value;
}
