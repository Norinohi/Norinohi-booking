"use client";

import { z } from "zod";

/*
 * The guest block of the checkout form, kept across a remount of the wizard.
 *
 * The flow is one react-hook-form living in component state, and the wizard remounts at its
 * own address more often than it looks: a language switch is a navigation to the same path
 * under a different locale prefix, and it used to empty a filled-in Guest Details on the way.
 *
 * sessionStorage, not localStorage, and not the URL. This is the customer's name, email,
 * phone and whatever they wrote in the free-text box, so it must not outlive the tab, reach
 * the address bar, or be waiting for the next person on a shared machine. The booking token
 * beside it in `guest-access.ts` is a bearer credential and is kept differently on purpose.
 *
 * Consents are deliberately absent. Agreeing to the operator's terms is an act, not a form
 * value to restore, and least of all across a switch into a language the customer has not
 * yet read them in.
 */

const PREFIX = "booking-guest:";

const draftSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  countryCode: z.string(),
  specialRequests: z.string(),
});

export type GuestDraft = z.infer<typeof draftSchema>;

export function rememberGuestDraft(slug: string, draft: GuestDraft): void {
  try {
    window.sessionStorage.setItem(PREFIX + slug, JSON.stringify(draft));
  } catch {
    // Private modes and full quotas both throw. The flow continues off the in-memory copy;
    // only a remount loses it, which is where this started.
  }
}

/** Parsed rather than cast: the store is editable, and a bad shape must not reach the form. */
export function guestDraftFor(slug: string): GuestDraft | null {
  try {
    const stored = window.sessionStorage.getItem(PREFIX + slug);
    if (!stored) return null;
    const parsed = draftSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function forgetGuestDraft(slug: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + slug);
  } catch {
    // Nothing to do: the draft is scoped to this tab and goes with it.
  }
}
