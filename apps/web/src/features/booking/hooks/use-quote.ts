"use client";

import { useMutation } from "@tanstack/react-query";
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
  const [quote, setQuote] = useState<Quote | null>(null);
  const create = useMutation(quoteMutationOptions());
  const reprice = useMutation(repriceMutationOptions());

  async function quoteFor(selection: QuoteSelection) {
    const next = await create.mutateAsync({ listingId, ...selection });
    setQuote(next);
    return next;
  }

  async function load(quoteId: string) {
    const next = await reprice.mutateAsync({ quoteId });
    setQuote(next);
    return next;
  }

  async function repriceWith(changes: Omit<RepriceInput, "quoteId">) {
    if (!quote) return null;
    const next = await reprice.mutateAsync({ quoteId: quote.quoteId, ...changes });
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
