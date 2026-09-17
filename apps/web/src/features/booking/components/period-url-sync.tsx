"use client";

import { useEffect } from "react";

import { useSearchedPeriodState } from "../hooks/use-searched-period";
import { useBooking } from "./booking-provider";

/**
 * Keeps `?checkIn=&checkOut=` on the charter the sidebar has priced.
 *
 * The dates arrive in the URL from a search card, and the sidebar used to leave them there after
 * the visitor picked other ones, so a reload, a shared link or "Back to the yacht" from checkout
 * reopened the page on the week they had moved away from. Written from the quote rather than
 * from the calendar, so the URL only ever names a period the vendor actually priced.
 *
 * Replace rather than push, as `QuoteUrlSync` does: each pick is a correction, not a place to go
 * back to.
 */
export default function PeriodUrlSync() {
  const { quote } = useBooking();
  const [period, setPeriod] = useSearchedPeriodState();
  const checkIn = quote?.checkIn ?? null;
  const checkOut = quote?.checkOut ?? null;

  useEffect(() => {
    if (!checkIn || !checkOut) return;
    if (checkIn === period.checkIn && checkOut === period.checkOut) return;
    void setPeriod({ checkIn, checkOut }, { history: "replace", scroll: false });
  }, [checkIn, checkOut, period.checkIn, period.checkOut, setPeriod]);

  return null;
}
