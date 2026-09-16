"use client";

import { useEffect, useRef, useState } from "react";

import type { Quote } from "../api/queries";
import { isSlotConflict } from "../lib/slot-conflict";
import type { useQuote } from "./use-quote";

type LoadQuote = ReturnType<typeof useQuote>["load"];

/** Enters the wizard on the quote its URL names, and asks again when that read failed. */
export function useQuoteLoad(
  quoteId: string | null | undefined,
  quote: Quote | null,
  load: LoadQuote,
  setSlotError: (refused: boolean) => void,
) {
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

  return { loadError, retryLoad };
}
