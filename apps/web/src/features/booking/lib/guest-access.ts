/*
 * Where a guest's booking token lives between steps.
 *
 * Checkout without an account hands back a token that authorises exactly one booking,
 * and the payment step, the confirmation screen and the invoice all need it. It is
 * kept in localStorage rather than the URL: a link in the address bar ends up in
 * history, in a shared screenshot and in whatever the browser syncs, and this one is
 * a bearer credential. Reloading and returning later on the same device still work.
 *
 * Nothing here is a security boundary — the server decides — it only stops the flow
 * from losing the token between two pages.
 */

const PREFIX = "booking-access:";

export function rememberGuestAccess(bookingId: string, token: string | null): void {
  if (!token) return;
  try {
    window.localStorage.setItem(PREFIX + bookingId, token);
  } catch {
    // Private modes and full quotas both throw. The flow continues in this tab off
    // the in-memory copy; only a reload loses it, which is better than failing here.
  }
}

export function guestAccessFor(bookingId: string | null | undefined): string | undefined {
  if (!bookingId) return undefined;
  try {
    return window.localStorage.getItem(PREFIX + bookingId) ?? undefined;
  } catch {
    return undefined;
  }
}
