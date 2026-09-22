import { placeLine } from "../lib/place-line";
import { oneWayRouteOf, oneWayRouteText } from "../lib/one-way-route";
import type { CommercialSnapshot, payment } from "@yacht-charter/db/schema/booking";
import type { quote } from "@yacht-charter/db/schema/quote";
import { env } from "@yacht-charter/env/server";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { log, parseError } from "evlog";
import {
  type BalanceReminderStage,
  type RefundMethod,
  sendBalanceReminderEmail,
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendBookingReceivedEmail,
  sendHoldExpiringEmail,
  sendInvoiceIssuedEmail,
  sendPaymentReceivedEmail,
  sendRefundIssuedEmail,
} from "@yacht-charter/transactional";

import { COMPANY } from "../lib/company";
import { atCheckInMinor } from "./checkout-amounts";
import { notifyStaff } from "./enquiry-email";

/*
 * The emails checkout and the refund flow send. The confirmation screen has always promised the
 * first one ("we've sent your confirmation by email"), and until it existed a customer who closed
 * that tab had the reference nowhere. The others close the same gap for the moments money moves
 * without a screen in front of anyone: a bank transfer we are waiting on, and one we sent.
 *
 * Checkout sends three, at three different moments, because they are three different facts and a
 * customer who gets one mail cannot tell which of them is true. The booking is held (nothing paid,
 * the slot running down), the payment arrived (money we now owe them a receipt for), the operator
 * committed (the charter exists). They used to be one mail, sent at the first moment and worded as
 * the third.
 *
 * Sending is best-effort by construction: a booking that exists must not be undone because Resend
 * was down, and the customer can still reach everything from the screen they are on. Failures are
 * logged and swallowed by each notify function — except `notifyBookingReceived`, which is called
 * from the outbox rather than from checkout and lets its failures out so the drain can retry them.
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

/**
 * The part of the total the base collects on the day, for the one row every money block in
 * here owes the customer. Undefined at zero, so a charter with no such line shows no row at
 * all rather than "€0" — the same condition the booking page applies.
 *
 * Without it the block does not add up: `total` carries these lines and `outstanding` does
 * not, so a settled booking reads as underpaid by exactly this much.
 */
function atMarina(priced: typeof quote.$inferSelect): string | undefined {
  const amountMinor = atCheckInMinor(priced);
  return amountMinor > 0 ? money(amountMinor, priced.currency) : undefined;
}

/**
 * The route line a one-way charter's mail carries beside the marina, which names only where it
 * starts. Absent for a round trip, so the mail reads as it always did.
 */
function routeLine(priced: typeof quote.$inferSelect): { oneWayRoute?: string } {
  const route = oneWayRouteOf(priced);
  return route ? { oneWayRoute: oneWayRouteText(route) } : {};
}

/** Locale-prefixed like every app route — `/en/bookings/...`, matching the i18n routing. */
function appUrl(path: string): string {
  return `${env.CORS_ORIGIN}/${LOCALE}${path}`;
}

export type BookingReceivedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  snapshot: CommercialSnapshot;
  priced: typeof quote.$inferSelect;
  outstandingMinor: number;
  /** When the operator's hold lapses. Null for a provider that grants no option. */
  holdExpiresAt: Date | null;
  /** True while the account has no password of its own, which is what the callout offers to fix. */
  isGuest: boolean;
};

/**
 * Sent over a booking nobody has paid for yet, from the `booking_received` outbox message
 * `createHold` writes. Throws rather than logging: nothing is waiting on this call any more,
 * and a swallowed failure here would be a confirmation the customer never gets and no record
 * of why.
 */
export async function notifyBookingReceived(booking: BookingReceivedEmail): Promise<void> {
  const { snapshot, priced } = booking;

  await sendBookingReceivedEmail(booking.to, {
    guestName: booking.guestName,
    reference: booking.reference,
    yachtName: snapshot.listingTitle,
    checkIn: day(priced.checkIn),
    checkOut: day(priced.checkOut),
    marina: placeLine(snapshot.baseName, snapshot.baseAddress, snapshot.countryName),
    ...routeLine(priced),
    guests: priced.guests,
    crew: priced.crewType ?? undefined,
    imageUrl: snapshot.mainImage ?? undefined,
    total: money(priced.totalMinor, priced.currency),
    paid: money(0, priced.currency),
    outstanding: money(booking.outstandingMinor, priced.currency),
    dueAtCheckIn: atMarina(priced),
    bookingUrl: appUrl(`/bookings/${booking.bookingId}`),
    payUrl: appUrl(`/bookings/${booking.bookingId}/pay`),
    holdExpiresAt: booking.holdExpiresAt ? day(booking.holdExpiresAt.toISOString()) : undefined,
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
}

export type BookingConfirmedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  snapshot: CommercialSnapshot;
  priced: typeof quote.$inferSelect;
  paidMinor: number;
  outstandingMinor: number;
  /** The operator's own reservation number, which is what the marina answers to. */
  providerReference: string | null;
  crewListLink: string | null;
  /** The operator's rule for bringing the boat back to base, in its own words. */
  returnNote?: string | null;
};

/**
 * Sent once the operator has committed the reservation, from both routes into CONFIRMED.
 *
 * The pay link is offered only where something is still owed: a deposit charter is confirmed
 * with half the money in, and a settled one must not be sent to a payment screen that would
 * answer ALREADY_PAID.
 */
export async function notifyBookingConfirmed(booking: BookingConfirmedEmail): Promise<void> {
  const { snapshot, priced } = booking;

  try {
    await sendBookingConfirmedEmail(booking.to, {
      guestName: booking.guestName,
      reference: booking.reference,
      yachtName: snapshot.listingTitle,
      checkIn: day(priced.checkIn),
      checkOut: day(priced.checkOut),
      marina: placeLine(snapshot.baseName, snapshot.baseAddress, snapshot.countryName),
      ...routeLine(priced),
      guests: priced.guests,
      imageUrl: snapshot.mainImage ?? undefined,
      total: money(priced.totalMinor, priced.currency),
      paid: money(booking.paidMinor, priced.currency),
      outstanding: money(booking.outstandingMinor, priced.currency),
      dueAtCheckIn: atMarina(priced),
      balanceDueAt: priced.paymentPolicy.balanceDueAt
        ? day(priced.paymentPolicy.balanceDueAt)
        : undefined,
      providerReference: booking.providerReference ?? undefined,
      crewListUrl: booking.crewListLink ?? undefined,
      returnNote: booking.returnNote ?? undefined,
      bookingUrl: appUrl(`/bookings/${booking.bookingId}`),
      payUrl:
        booking.outstandingMinor > 0 ? appUrl(`/bookings/${booking.bookingId}/pay`) : undefined,
      supportUrl: appUrl(`/support?booking=${booking.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "booking_confirmed",
      reference: booking.reference,
      ...thrownFields(parseError(cause)),
    });
  }
}

type PaymentKind = (typeof payment.$inferSelect)["kind"];

/** The schema's names as a customer would say them. */
const PAYMENT_KIND_LABEL = {
  deposit: "deposit",
  balance: "balance",
  full: "full payment",
  checkin_extras: "extras payment",
  security_deposit: "security deposit",
} satisfies Record<PaymentKind, string>;

export type BookingStaffAlert = {
  bookingId: string;
  reference: string;
  snapshot: CommercialSnapshot;
  priced: typeof quote.$inferSelect;
  guestName: string | null;
  guestEmail: string | null;
  paidMinor: number;
  outstandingMinor: number;
  /** The operator's own reservation number, which is what the marina answers to. */
  providerReference: string | null;
};

/**
 * Tells the team a charter now exists.
 *
 * Only on confirmation, and deliberately not on the hold that precedes it: a held booking is a
 * customer part-way through a checkout, most of which either pay within the hour or lapse, and
 * an alert per attempt would be a queue nobody reads. By the time this fires the operator has
 * committed the reservation and there is something to act on.
 *
 * Sent whether or not the customer left an address — a booking with no guest email is exactly
 * the one staff most need to know about, since nothing else will reach that customer.
 */
export async function announceBookingToStaff(alert: BookingStaffAlert): Promise<void> {
  const { snapshot, priced } = alert;
  const oneWay = oneWayRouteOf(priced);

  await notifyStaff({
    title: `New booking ${alert.reference} — ${snapshot.listingTitle}`,
    facts: [
      {
        label: "Guest",
        value: alert.guestEmail
          ? `${alert.guestName ?? "Guest"} (${alert.guestEmail})`
          : `${alert.guestName ?? "Guest"} (no email on the booking)`,
      },
      { label: "Yacht", value: snapshot.listingTitle },
      { label: "Base", value: placeLine(snapshot.baseName, snapshot.countryName) },
      ...(oneWay ? [{ label: "Route", value: oneWayRouteText(oneWay) }] : []),
      { label: "Charter", value: `${day(priced.checkIn)} → ${day(priced.checkOut)}` },
      { label: "Guests", value: String(priced.guests) },
      { label: "Total", value: money(priced.totalMinor, priced.currency) },
      { label: "Paid", value: money(alert.paidMinor, priced.currency) },
      ...(alert.outstandingMinor > 0
        ? [{ label: "Still to pay", value: money(alert.outstandingMinor, priced.currency) }]
        : []),
      ...(alert.providerReference
        ? [{ label: "Operator reference", value: alert.providerReference }]
        : []),
    ],
    path: `/admin/staff/bookings/${alert.bookingId}`,
    actionLabel: "Open the booking",
    audience: "booking",
  });
}

export type PaymentReceivedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  amountMinor: number;
  currency: string;
  paidAt: Date;
  method: "card" | "bank transfer";
  kind: PaymentKind;
  totalMinor: number;
  paidTotalMinor: number;
  outstandingMinor: number;
  /** The part of the total settled with the base, which is in `totalMinor` and in nothing else. */
  atCheckInMinor: number;
  balanceDueAt: string | null;
};

/** The receipt for one payment, sent when the money landed rather than when Pay was pressed. */
export async function notifyPaymentReceived(paid: PaymentReceivedEmail): Promise<void> {
  try {
    await sendPaymentReceivedEmail(paid.to, {
      guestName: paid.guestName,
      reference: paid.reference,
      yachtName: paid.yachtName,
      amount: money(paid.amountMinor, paid.currency),
      paidAt: day(paid.paidAt.toISOString()),
      method: paid.method,
      kind: PAYMENT_KIND_LABEL[paid.kind],
      total: money(paid.totalMinor, paid.currency),
      paidTotal: money(paid.paidTotalMinor, paid.currency),
      outstanding: money(paid.outstandingMinor, paid.currency),
      dueAtCheckIn: paid.atCheckInMinor > 0 ? money(paid.atCheckInMinor, paid.currency) : undefined,
      settled: paid.outstandingMinor === 0,
      // Only while something is left: a settled charter with a policy date would otherwise be
      // told to expect a payment it has already made.
      balanceDueAt:
        paid.outstandingMinor > 0 && paid.balanceDueAt ? day(paid.balanceDueAt) : undefined,
      bookingUrl: appUrl(`/bookings/${paid.bookingId}`),
      supportUrl: appUrl(`/support?booking=${paid.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "payment_receipt",
      reference: paid.reference,
      ...thrownFields(parseError(cause)),
    });
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
  /** When the operator's option lapses. Null for a provider that grants no option. */
  holdExpiresAt: Date | null;
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
      /*
       * Only where the option is the binding deadline. Our terms run seven days and stop at the
       * departure; a provider option is commonly shorter than that, and the mail used to promise
       * a hold until the due date over a boat the operator had already taken back.
       */
      holdExpiresAt:
        invoice.holdExpiresAt && invoice.holdExpiresAt < invoice.dueAt
          ? day(invoice.holdExpiresAt.toISOString())
          : undefined,
      checkIn: day(invoice.checkIn),
      checkOut: day(invoice.checkOut),
      bank: COMPANY.bank,
      payeeName: COMPANY.legalName,
      invoiceUrl: appUrl(`/bookings/${invoice.bookingId}/invoice`),
      supportUrl: appUrl(`/support?booking=${invoice.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "invoice_issued",
      invoiceNumber: invoice.invoiceNumber,
      ...thrownFields(parseError(cause)),
    });
  }
}

export type RefundIssuedEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  /** Which way the money settled in this call, which is what the mail tells them to watch. */
  method: RefundMethod;
  refundedMinor: number;
  /** What the booking keeps. Zero sends no retained figure at all rather than "€0". */
  retainedMinor: number;
  /**
   * Money that came in by transfer and still has to be sent back by hand. Kept out of
   * `retainedMinor` because it is the opposite of retained: we owe it and have not sent it.
   */
  awaitingTransferMinor: number;
  currency: string;
  reason?: string;
};

export async function notifyRefundIssued(refund: RefundIssuedEmail): Promise<void> {
  try {
    await sendRefundIssuedEmail(refund.to, {
      guestName: refund.guestName,
      reference: refund.reference,
      yachtName: refund.yachtName,
      method: refund.method,
      refunded: money(refund.refundedMinor, refund.currency),
      retained: refund.retainedMinor > 0 ? money(refund.retainedMinor, refund.currency) : undefined,
      awaitingTransfer:
        refund.awaitingTransferMinor > 0
          ? money(refund.awaitingTransferMinor, refund.currency)
          : undefined,
      reason: refund.reason,
      bookingUrl: appUrl(`/bookings/${refund.bookingId}`),
      supportUrl: appUrl(`/support?booking=${refund.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "refund_issued",
      reference: refund.reference,
      ...thrownFields(parseError(cause)),
    });
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
  /** Which of the three letters this is. Defaults to the first. */
  stage?: BalanceReminderStage;
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
      stage: reminder.stage,
      payUrl: appUrl(`/bookings/${reminder.bookingId}/pay`),
      supportUrl: appUrl(`/support?booking=${reminder.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "balance_reminder",
      stage: reminder.stage ?? "due_soon",
      reference: reminder.reference,
      ...thrownFields(parseError(cause)),
    });
  }
}

export type HoldExpiringEmail = {
  to: string;
  guestName: string;
  bookingId: string;
  reference: string;
  yachtName: string;
  outstandingMinor: number;
  currency: string;
  holdExpiresAt: Date;
  checkIn: string;
  checkOut: string;
};

/**
 * Sent while an unpaid hold is still standing, so the customer can still act on it. The expiry
 * sweep that releases it sends nothing, deliberately: by then the yacht is gone and the only
 * useful mail was the one before.
 */
export async function notifyHoldExpiring(hold: HoldExpiringEmail): Promise<void> {
  try {
    await sendHoldExpiringEmail(hold.to, {
      guestName: hold.guestName,
      reference: hold.reference,
      yachtName: hold.yachtName,
      outstanding: money(hold.outstandingMinor, hold.currency),
      holdExpiresAt: day(hold.holdExpiresAt.toISOString()),
      checkIn: day(hold.checkIn),
      checkOut: day(hold.checkOut),
      payUrl: appUrl(`/bookings/${hold.bookingId}/pay`),
      supportUrl: appUrl(`/support?booking=${hold.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "hold_expiring",
      reference: hold.reference,
      ...thrownFields(parseError(cause)),
    });
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
  /** Whether money had landed, or was still clearing, when the booking was cancelled. */
  charged: boolean;
  reason?: string;
};

/**
 * The cancellation that is not a refund.
 *
 * Only for the branch that ends at CANCELLED. A confirmed booking goes to REFUND_PENDING instead
 * and is answered by the refund mail, which states the amount, and sending both would tell the
 * same customer twice, once without the figure that matters. `charged` covers the case that is
 * neither: a checkout cancelled with money already in, where the mail must not claim otherwise.
 */
export async function notifyBookingCancelled(booking: BookingCancelledEmail): Promise<void> {
  try {
    await sendBookingCancelledEmail(booking.to, {
      guestName: booking.guestName,
      reference: booking.reference,
      yachtName: booking.yachtName,
      checkIn: day(booking.checkIn),
      checkOut: day(booking.checkOut),
      charged: booking.charged,
      reason: booking.reason,
      searchUrl: appUrl("/yachts"),
      supportUrl: appUrl(`/support?booking=${booking.bookingId}`),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "booking_cancelled",
      reference: booking.reference,
      ...thrownFields(parseError(cause)),
    });
  }
}
