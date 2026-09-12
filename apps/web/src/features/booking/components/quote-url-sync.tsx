"use client";

import { useQueryStates } from "nuqs";
import { useEffect } from "react";

import { bookingParsers } from "../lib/search-params";
import { useBooking } from "./booking-provider";

/**
 * Keeps `?quoteId=` pointing at the quote the wizard is actually working with.
 *
 * A quote is immutable: every reprice supersedes it and returns a new id, so the id the
 * wizard was entered with is stale the moment anything is ticked. Nothing wrote the new one
 * back, and the URL is the only memory this flow has — which showed up as the booking losing
 * its extras, promo, credit and guest count whenever the page was re-entered at its own
 * address. Switching language is exactly that: a navigation to the same path under a new
 * locale prefix, so the wizard remounted, reloaded the entry quote, and rolled the customer
 * back to the snapshot minted on the listing page.
 *
 * Replace rather than push: superseded ids are not places to go back to, and one Back should
 * leave checkout rather than walk the chain of every reprice.
 */
export default function QuoteUrlSync() {
  const { quote } = useBooking();
  const [{ quoteId }, setParams] = useQueryStates(bookingParsers);
  const liveQuoteId = quote?.quoteId ?? null;

  useEffect(() => {
    if (!liveQuoteId || liveQuoteId === quoteId) return;
    void setParams({ quoteId: liveQuoteId }, { history: "replace", scroll: false });
  }, [liveQuoteId, quoteId, setParams]);

  return null;
}
