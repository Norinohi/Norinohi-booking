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
   * Opted out of the React Compiler. Compiled, the mutation status this hook reads is cached and
   * never re-read once the memo is populated, so `isPending` stays true for the rest of the visit:
   * the reprice resolves, the quote renders, and the sidebar sits on skeletons and a spinning
   * promo button forever. Verified by toggling this directive against a live reprice.
   */
  "use no memo";
  /* Display only: the quote row keeps the provider's wording, and this decides what the sidebar
     reads it back as. Sent on every call because a reprice returns a whole new quote. */
  const locale = useLocale();
  const [quote, setQuote] = useState<Quote | null>(null);
  const create = useMutation(quoteMutationOptions());
  const reprice = useMutation(repriceMutationOptions());

  async function quoteFor(selection: QuoteSelection) {
    const next = await create.mutateAsync({ listingId, locale, ...selection });
    setQuote(next);
    return next;
  }

  async function load(quoteId: string) {
    const next = await reprice.mutateAsync({ quoteId, locale });
    setQuote(next);
    return next;
  }

  async function repriceWith(changes: Omit<RepriceInput, "quoteId">) {
    if (!quote) return null;
    const next = await reprice.mutateAsync({ quoteId: quote.quoteId, locale, ...changes });
    setQuote(next);
    return next;
  }

  return {
    quote,
    quoteFor,
    load,
    repriceWith,
    isPending: create.isPending || reprice.isPending,
  };
}
