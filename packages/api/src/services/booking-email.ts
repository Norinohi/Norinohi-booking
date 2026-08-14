import type { CommercialSnapshot } from "@yacht-charter/db/schema/booking";
import type { quote } from "@yacht-charter/db/schema/quote";
import { env } from "@yacht-charter/env/server";
import { sendBookingConfirmationEmail } from "@yacht-charter/transactional";

/*
 * The one email checkout sends. The confirmation screen has always promised it ("we've sent your
 * confirmation by email"), and until now nothing did — a customer who closed that tab had the
 * reference nowhere.
 *
 * Sending is best-effort by construction: a booking that exists must not be undone because Resend
 * was down, and the customer can still reach everything from the screen they are on. Failures are
 * logged and swallowed by `notifyBookingHeld`.
 */

/** The locale the email is written in. Templates are English-only for now. */
const LOCALE = "en";

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function day(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** Locale-prefixed like every app route — `/en/bookings/...`, matching the i18n routing. */
function appUrl(path: string): string {
  return `${env.CORS_ORIGIN}/${LOCALE}${path}`;
}

export type BookingHeldEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  snapshot: CommercialSnapshot;
  priced: typeof quote.$inferSelect;
  outstandingMinor: number;
  /** True for a guest checkout, whose account was provisioned here and has no password yet. */
  isGuest: boolean;
};

export async function notifyBookingHeld(booking: BookingHeldEmail): Promise<void> {
  const { snapshot, priced } = booking;

  try {
    await sendBookingConfirmationEmail(booking.to, {
      guestName: booking.guestName,
      reference: booking.reference,
      yachtName: snapshot.listingTitle,
      checkIn: day(priced.checkIn),
      checkOut: day(priced.checkOut),
      marina: `${snapshot.baseName}, ${snapshot.countryName}`,
      guests: priced.guests,
      crew: priced.crewType ?? undefined,
      imageUrl: snapshot.mainImage ?? undefined,
      total: money(priced.totalMinor, priced.currency),
      paid: money(0, priced.currency),
      outstanding: money(booking.outstandingMinor, priced.currency),
      bookingUrl: appUrl(`/bookings/${booking.bookingId}`),
      /*
       * Not a minted token: the account exists but has never chosen a password, and the
       * forgot-password flow is the one path that sets one, with better-auth issuing the
       * single-use link. Prefilled with the address they booked with, and `welcome=1`
       * carries "first password, not a reset" through to the mail and the screen.
       */
      setPasswordUrl: booking.isGuest
        ? appUrl(`/forgot-password?email=${encodeURIComponent(booking.to)}&welcome=1`)
        : undefined,
      supportUrl: appUrl(`/support?booking=${booking.bookingId}`),
    });
  } catch (cause) {
    console.error(`[email] booking confirmation for ${booking.reference} failed`, cause);
  }
}
