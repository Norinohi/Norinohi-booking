import type { CommercialSnapshot } from "@yacht-charter/db/schema/booking";
import type { quote } from "@yacht-charter/db/schema/quote";
import { env } from "@yacht-charter/env/server";
import {
  sendBalanceReminderEmail,
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail,
  sendInvoiceIssuedEmail,
  sendRefundIssuedEmail,
} from "@yacht-charter/transactional";

import { COMPANY } from "../lib/company";

/*
 * The emails checkout and the refund flow send. The confirmation screen has always promised the
 * first one ("we've sent your confirmation by email"), and until it existed a customer who closed
 * that tab had the reference nowhere. The other two close the same gap for the two moments money
 * moves without a screen in front of anyone: a bank transfer we are waiting on, and one we sent.
 *
 * Sending is best-effort by construction: a booking that exists must not be undone because Resend
 * was down, and the customer can still reach everything from the screen they are on. Failures are
 * logged and swallowed by each notify function.
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

export type InvoiceIssuedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  invoiceNumber: string;
  yachtName: string;
  amountMinor: number;
  currency: string;
  dueAt: Date;
  checkIn: string;
  checkOut: string;
};

/**
 * The bank details for an invoice the customer asked for.
 *
 * Sent with the booking reference as the payment reference, because an unreferenced transfer is
 * money nobody can match to a charter — the invoice row alone does not identify it in a bank feed.
 */
export async function notifyInvoiceIssued(invoice: InvoiceIssuedEmail): Promise<void> {
  try {
    await sendInvoiceIssuedEmail(invoice.to, {
      guestName: invoice.guestName,
      reference: invoice.reference,
      invoiceNumber: invoice.invoiceNumber,
      yachtName: invoice.yachtName,
      amount: money(invoice.amountMinor, invoice.currency),
      dueAt: day(invoice.dueAt.toISOString()),
      checkIn: day(invoice.checkIn),
      checkOut: day(invoice.checkOut),
      bank: COMPANY.bank,
      payeeName: COMPANY.legalName,
      invoiceUrl: appUrl(`/bookings/${invoice.bookingId}/invoice`),
      supportUrl: appUrl(`/support?booking=${invoice.bookingId}`),
    });
  } catch (cause) {
    console.error(`[email] invoice ${invoice.invoiceNumber} failed`, cause);
  }
}

export type RefundIssuedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  refundedMinor: number;
  /** What the booking keeps. Zero sends no retained figure at all rather than "€0". */
  outstandingMinor: number;
  currency: string;
  reason?: string;
};

export async function notifyRefundIssued(refund: RefundIssuedEmail): Promise<void> {
  try {
    await sendRefundIssuedEmail(refund.to, {
      guestName: refund.guestName,
      reference: refund.reference,
      yachtName: refund.yachtName,
      refunded: money(refund.refundedMinor, refund.currency),
      outstanding:
        refund.outstandingMinor > 0 ? money(refund.outstandingMinor, refund.currency) : undefined,
      reason: refund.reason,
      bookingUrl: appUrl(`/bookings/${refund.bookingId}`),
      supportUrl: appUrl(`/support?booking=${refund.bookingId}`),
    });
  } catch (cause) {
    console.error(`[email] refund notice for ${refund.reference} failed`, cause);
  }
}

export type BalanceDueEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  amountMinor: number;
  currency: string;
  dueAt: Date;
  checkIn: string;
  checkOut: string;
};

export async function notifyBalanceDue(reminder: BalanceDueEmail): Promise<void> {
  try {
    await sendBalanceReminderEmail(reminder.to, {
      guestName: reminder.guestName,
      reference: reminder.reference,
      yachtName: reminder.yachtName,
      amount: money(reminder.amountMinor, reminder.currency),
      dueAt: day(reminder.dueAt.toISOString()),
      checkIn: day(reminder.checkIn),
      checkOut: day(reminder.checkOut),
      payUrl: appUrl(`/bookings/${reminder.bookingId}/pay`),
      supportUrl: appUrl(`/support?booking=${reminder.bookingId}`),
    });
  } catch (cause) {
    console.error(`[email] balance reminder for ${reminder.reference} failed`, cause);
  }
}

export type BookingCancelledEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  checkIn: string;
  checkOut: string;
  reason?: string;
};

/**
 * A cancellation with no money in it.
 *
 * Only for the branch that ends at CANCELLED. A booking that was paid for goes to
 * REFUND_PENDING instead and is answered by the refund mail, which states the amount — sending
 * both would tell the same customer twice, once without the figure that matters.
 */
export async function notifyBookingCancelled(booking: BookingCancelledEmail): Promise<void> {
  try {
    await sendBookingCancelledEmail(booking.to, {
      guestName: booking.guestName,
      reference: booking.reference,
      yachtName: booking.yachtName,
      checkIn: day(booking.checkIn),
      checkOut: day(booking.checkOut),
      reason: booking.reason,
      searchUrl: appUrl("/yachts"),
      supportUrl: appUrl(`/support?booking=${booking.bookingId}`),
    });
  } catch (cause) {
    console.error(`[email] cancellation notice for ${booking.reference} failed`, cause);
  }
}
