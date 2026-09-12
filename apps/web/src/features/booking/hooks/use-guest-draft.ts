"use client";

import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { BookingValues } from "../lib/booking-form";
import { guestDraftFor, rememberGuestDraft } from "../lib/guest-draft";

/**
 * Carries a filled-in Guest Details block across a remount of the wizard.
 *
 * Restored in an effect rather than as a lazy default, because the screen is server-rendered
 * and `sessionStorage` does not exist there: seeding the form during render would hydrate one
 * tree against another. The fields are therefore empty for a frame, which is the same frame
 * the rest of the checkout spends waiting for its quote.
 */
export function useGuestDraft(form: UseFormReturn<BookingValues>, slug: string): void {
  const { getValues, reset, watch } = form;
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const draft = guestDraftFor(slug);
    if (!draft) return;
    /* Defaults kept, so the form still knows which fields the customer has actually changed. */
    reset({ ...getValues(), guestDetails: draft }, { keepDefaultValues: true });
  }, [slug, getValues, reset]);

  useEffect(() => {
    const subscription = watch((values) => {
      const guest = values.guestDetails;
      if (!guest) return;
      rememberGuestDraft(slug, {
        fullName: guest.fullName ?? "",
        email: guest.email ?? "",
        phone: guest.phone ?? "",
        countryCode: guest.countryCode ?? "",
        specialRequests: guest.specialRequests ?? "",
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [slug, watch]);
}
