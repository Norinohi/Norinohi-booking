"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

import type { Quote, QuoteInput, RepriceInput } from "../api/queries";
import { quoteMutationOptions, repriceMutationOptions } from "../api/queries";

export type QuoteSelection = {
  checkIn: string;
  checkOut: string;
  guests: number;
  crewType?: QuoteInput["crewType"];
  extras?: string[];
  /*
   * The listing's own currency, so the sidebar quotes the money the card advertised.
   *
   * Omitting it took the contract's EUR default, which is a currency for most of the catalogue
   * and a translation for the rest: a Bahamas fleet publishes its rate list in USD and cannot be
   * asked for anything else, so the card showed $7,619 and the panel under it answered €6,536 --
   * one charter, one price, two currencies, and no way for a visitor to see they matched.
   * Reprice carries the quote's own currency forward, so this only has to be set once.
   */
  currency?: string;
};

/*
 * Owns the one live quote a screen is working with.
 *
 * `quoteFor` mints a fresh snapshot from a full selection (the detail sidebar); `load` reads an
 * existing quote by id (the wizard, entered with `?quoteId`); `repriceWith` supersedes the current
 * quote with a partial change (extras). The backend returns a NEW `quoteId` on every reprice, so the
 * latest id always lives inside `quote.quoteId` — callers push it to the URL. Never modelled as a
 * query: reprice mutates, so it must not auto-refetch.
 */
export function useQuote(listingId: string) {
  /*
   * Opted out of the React Compiler, kept from the first attempt at the stuck-skeleton bug: the
   * status this hook read was cached and never re-read once the memo was populated. It was not
   * the whole cause - see `inFlight` below - but the distrust was earned, and this hook is small
   * enough that not memoising it costs nothing.
   */
  "use no memo";
  /* Display only: the quote row keeps the provider's wording, and this decides what the sidebar
     reads it back as. Sent on every call because a reprice returns a whole new quote. */
  const locale = useLocale();
  const [quote, setQuote] = useState<Quote | null>(null);
  const create = useMutation(quoteMutationOptions());
  const reprice = useMutation(repriceMutationOptions());

  /*
   * What is in flight, counted here rather than read off `create.isPending` / `reprice.isPending`.
   *
   * The directive above was the first attempt at the same bug and is not enough on its own: the
   * mutation's own status still went `pending -> idle -> pending` across renders after a single
   * resolved call, with nothing on the wire in between, and the panel it fed sat on skeletons
   * and a spinning promo button over a quote it already had. Traced with a per-render log: one
   * `mutateAsync`, one resolution, one `setQuote`, and a status that contradicted all three.
   *
   * A counter of our own cannot drift like that. It is incremented before the call and
   * decremented in a `finally`, so it answers "are we waiting" from what this hook actually did
   * rather than from an observer whose identity the renderer may swap underneath it.
   *
   * A count, not a boolean: the extras control debounces into a reprice while a promo apply can
   * still be settling, and two overlapping calls must not have the first to finish declare the
   * panel idle.
   */
  const [inFlight, setInFlight] = useState(0);

  async function tracked<T>(run: () => Promise<T>): Promise<T> {
    setInFlight((count) => count + 1);
    try {
      return await run();
    } finally {
      setInFlight((count) => count - 1);
    }
  }

  async function quoteFor(selection: QuoteSelection) {
    const next = await tracked(() => create.mutateAsync({ listingId, locale, ...selection }));
    setQuote(next);
    return next;
  }

  async function load(quoteId: string) {
    const next = await tracked(() => reprice.mutateAsync({ quoteId, locale }));
    setQuote(next);
    return next;
  }

  async function repriceWith(changes: Omit<RepriceInput, "quoteId">) {
    if (!quote) return null;
    const next = await tracked(() =>
      reprice.mutateAsync({ quoteId: quote.quoteId, locale, ...changes }),
    );
    setQuote(next);
    return next;
  }

  return {
    quote,
    quoteFor,
    load,
    repriceWith,
    isPending: inFlight > 0,
  };
}
