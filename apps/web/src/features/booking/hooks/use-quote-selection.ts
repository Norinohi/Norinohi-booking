"use client";

import { useEffect, useRef, useState } from "react";

import { baseExtraCode, isVariantCode } from "@/lib/extra-code";

import type { Quote } from "../api/queries";
import type { CrewType, ListingDetail } from "../types";
import type { useQuote } from "./use-quote";

type RepriceWith = ReturnType<typeof useQuote>["repriceWith"];

const DEFAULT_GUESTS = 2;
const REPRICE_DEBOUNCE_MS = 400;

/**
 * Crew, guests and extras as the controls show them, read back off each quote that answers,
 * and the reprices every control and the promo and credit boxes make against the live quote.
 */
export function useQuoteSelection(
  listing: ListingDetail,
  quote: Quote | null,
  repriceWith: RepriceWith,
) {
  const [crewChoice, setCrewChoice] = useState<CrewType | undefined>();
  const [guests, setGuestsState] = useState(DEFAULT_GUESTS);
  const [extras, setExtrasState] = useState<string[]>([]);
  const [requestedExtras, setRequestedExtrasState] = useState<string[]>([]);
  /* Defaulted synchronously off the prefetched listing so the crew Select stays controlled. */
  const crewType = crewChoice ?? listing?.crew.options[0];

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

  /*
   * The crew variants the customer picked, off the quote's own list: a crew line reads the same
   * whether it was picked or chosen by the adapter, and only a pick should outlive a change of
   * party size. Sent beside every extras edit, since `extras` is one list on the wire.
   */
  const crewPicks = () => {
    if (!quote) return [];
    const aboard = new Set(
      quote.lines.filter((line) => line.group === "crew").map((line) => baseExtraCode(line.code)),
    );
    return quote.extras.filter((code) => isVariantCode(code) && aboard.has(baseExtraCode(code)));
  };

  /** One crew role's variant, replacing whatever was picked for that role before. */
  function selectCrewVariant(code: string) {
    if (!quote) return;
    const role = baseExtraCode(code);
    const picks = crewPicks().filter((pick) => baseExtraCode(pick) !== role);
    void repriceWith({ extras: [...extras, ...picks, code] });
  }

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
      await repriceWith({ extras: [...next, ...crewPicks()] });
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

  return {
    crewType,
    guests,
    extras,
    requestedExtras,
    setCrew,
    selectCrewVariant,
    setDropOff,
    setGuests,
    selectExtras,
    setExtras,
    requestExtras,
    setRequestedExtras,
    applyPromo,
    applyCredit,
  };
}
