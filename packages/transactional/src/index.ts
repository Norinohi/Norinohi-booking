import { render } from "@react-email/render";
import { env } from "@yacht-charter/env/server";
import { createElement } from "react";
import { type CreateEmailOptions, Resend } from "resend";

import { BalanceReminderEmail, type BalanceReminderEmailProps } from "./emails/balance-reminder";
import { BookingCancelledEmail, type BookingCancelledEmailProps } from "./emails/booking-cancelled";
import { BookingConfirmedEmail, type BookingConfirmedEmailProps } from "./emails/booking-confirmed";
import { BookingReceivedEmail, type BookingReceivedEmailProps } from "./emails/booking-received";
import { EnquiryAnswerEmail, type EnquiryAnswerEmailProps } from "./emails/enquiry-answer";
import { EnquiryReceivedEmail, type EnquiryReceivedEmailProps } from "./emails/enquiry-received";
import { HoldExpiringEmail, type HoldExpiringEmailProps } from "./emails/hold-expiring";
import { InvoiceIssuedEmail, type InvoiceIssuedEmailProps } from "./emails/invoice-issued";
import { LeadFollowUpEmail, type LeadFollowUpEmailProps } from "./emails/lead-follow-up";
import { PaymentReceivedEmail, type PaymentReceivedEmailProps } from "./emails/payment-received";
import { RefundIssuedEmail, type RefundIssuedEmailProps } from "./emails/refund-issued";
import { ResetPasswordEmail } from "./emails/reset-password";
import { SetPasswordEmail } from "./emails/set-password";
import { StaffAlertEmail, type StaffAlertEmailProps } from "./emails/staff-alert";
import { WelcomeEmail } from "./emails/welcome";

export type { RefundMethod } from "./emails/refund-issued";
export type { BalanceReminderStage } from "./emails/balance-reminder";

let client: Resend | undefined;

function getClient() {
  if (!env.RESEND_API_KEY) return undefined;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Which inbox an answer to this mail should land in.
 *
 * A reply to a confirmation is about a charter somebody is running and belongs with whoever runs
 * it; a reply to a welcome mail or an enquiry answer is not. Routing both to one address meant
 * one of the two teams reading the other's mail, and the volume only goes one way. `none` is for
 * internal alerts, which must never carry the public reply-to: an answer to one would arrive in
 * the customer-facing inbox looking like a customer wrote it.
 */
type Mailbox = "booking" | "general" | "none";

/**
 * The address replies to this mailbox go to, or undefined for no header at all.
 *
 * Booking mail falls back to the general address rather than to nothing, because an unset
 * BOOKING_REPLY_TO_EMAIL is far more likely to be a deployment that has not split its inboxes
 * yet than a deliberate "send booking mail with no way to answer it".
 */
function replyToFor(mailbox: Mailbox): string | undefined {
  if (mailbox === "none") return undefined;
  if (mailbox === "booking") return env.BOOKING_REPLY_TO_EMAIL ?? env.REPLY_TO_EMAIL;
  return env.REPLY_TO_EMAIL;
}

/*
 * Whether an answer typed into a mail client reaches a person. Without a reply-to a reply goes
 * to the sending identity, which is a noreply address on most domains. The three mails that
 * invite a reply ask this before they promise one, so the copy and the header can never
 * disagree.
 */
function isReplyable(mailbox: Mailbox): boolean {
  return Boolean(replyToFor(mailbox));
}

// Optional as a pair like the Google/Stripe keys: without RESEND_API_KEY and EMAIL_FROM
// sends are skipped rather than the server failing to boot. Callers read `skipped` to
// decide whether to surface the link some other way (e.g. a local dev log).
async function sendHtml(
  to: string,
  subject: string,
  html: string,
  { mailbox = "general" }: { mailbox?: Mailbox } = {},
) {
  const resend = getClient();
  if (!resend || !env.EMAIL_FROM) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not configured, skipping send to ${to}`);
    return { skipped: true } as const;
  }

  /*
   * One sending identity for everything, and the routing done with `replyTo` instead. The
   * alternative -- a second verified From per inbox -- would put two sender addresses in front
   * of customers for what is one company, and every domain-reputation gain of a verified sender
   * would then have to be earned twice.
   */
  const from = env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM;

  const payload: CreateEmailOptions = { from, to, subject, html };
  const replyTo = replyToFor(mailbox);
  if (replyTo) payload.replyTo = replyTo;

  const result = await resend.emails.send(payload);
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { skipped: false, id: result.data?.id } as const;
}

/**
 * What a customer gets the moment a booking is held, before any money has moved.
 *
 * The subject says "holding", not "confirmed", because that is what has happened: the mail goes
 * out over an unpaid booking, and calling it a confirmation left customers believing they were
 * booked when the slot was still running down. `sendBookingConfirmedEmail` is the one that means
 * it.
 *
 * Everything is pre-formatted by the caller: money and dates belong to the booking's currency
 * and the customer's locale, neither of which this package knows. The subject carries the
 * reference so a later "what was my booking number" search finds it.
 */
export async function sendBookingReceivedEmail(
  to: string,
  booking: Omit<BookingReceivedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(BookingReceivedEmail, { ...booking, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `We're holding ${booking.yachtName} — booking ${booking.reference}`, html, {
    mailbox: "booking",
  });
}

/** The charter is real: sent once the operator has committed the reservation. */
export async function sendBookingConfirmedEmail(
  to: string,
  booking: Omit<BookingConfirmedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(BookingConfirmedEmail, { ...booking, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `Confirmed: ${booking.yachtName} — booking ${booking.reference}`, html, {
    mailbox: "booking",
  });
}

/**
 * The receipt for one payment that landed. Its own mail rather than a line in the confirmation,
 * because a deposit charter pays twice and the second one has no confirmation to ride along with.
 */
export async function sendPaymentReceivedEmail(
  to: string,
  payment: Omit<PaymentReceivedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(PaymentReceivedEmail, { ...payment, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `${payment.amount} received — booking ${payment.reference}`, html, {
    mailbox: "booking",
  });
}

/**
 * The bank-transfer details, sent when a customer asks for an invoice. The subject carries the
 * invoice number so it is findable, and the amount so the mail is actionable from the list view.
 */
export async function sendInvoiceIssuedEmail(
  to: string,
  invoice: Omit<InvoiceIssuedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(InvoiceIssuedEmail, { ...invoice, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `Invoice ${invoice.invoiceNumber} — ${invoice.amount} due`, html, {
    mailbox: "booking",
  });
}

/** Confirmation that a booking is off, for the case where no money was ever taken. */
export async function sendBookingCancelledEmail(
  to: string,
  booking: Omit<BookingCancelledEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(BookingCancelledEmail, { ...booking, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `Booking ${booking.reference} is cancelled`, html, { mailbox: "booking" });
}

/**
 * The letters a confirmed booking's second installment earns as its date approaches and then
 * passes. The subject carries the stage as plainly as the body does: a customer scanning an
 * inbox has to be able to tell the overdue notice from the two that preceded it without
 * opening anything.
 */
export async function sendBalanceReminderEmail(
  to: string,
  reminder: Omit<BalanceReminderEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(BalanceReminderEmail, { ...reminder, appUrl: env.CORS_ORIGIN }),
  );
  const subject =
    reminder.stage === "overdue"
      ? `${reminder.amount} overdue since ${reminder.dueAt} — booking ${reminder.reference}`
      : `${reminder.amount} due ${reminder.dueAt} — booking ${reminder.reference}`;
  return sendHtml(to, subject, html, { mailbox: "booking" });
}

/** The last word before an unpaid hold is released by the expiry sweep. */
export async function sendHoldExpiringEmail(
  to: string,
  hold: Omit<HoldExpiringEmailProps, "appUrl">,
) {
  const html = await render(createElement(HoldExpiringEmail, { ...hold, appUrl: env.CORS_ORIGIN }));
  return sendHtml(
    to,
    `${hold.yachtName} is held until ${hold.holdExpiresAt} — booking ${hold.reference}`,
    html,
    { mailbox: "booking" },
  );
}

/** Confirmation that money went back, sent once a refund has actually settled. */
export async function sendRefundIssuedEmail(
  to: string,
  refund: Omit<RefundIssuedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(RefundIssuedEmail, { ...refund, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `${refund.refunded} refunded — booking ${refund.reference}`, html, {
    mailbox: "booking",
  });
}

/** The acknowledgement an enquiry gets — quote request, charter expert, or consultation. */
export async function sendLeadFollowUpEmail(
  to: string,
  lead: Omit<LeadFollowUpEmailProps, "appUrl" | "replyable">,
) {
  const html = await render(
    createElement(LeadFollowUpEmail, {
      ...lead,
      replyable: isReplyable("general"),
      appUrl: env.CORS_ORIGIN,
    }),
  );
  return sendHtml(to, "We have your enquiry — YachtSkanner", html);
}

/**
 * The reply staff send from the inbox — to a question about a booking, or to a pre-booking
 * enquiry, which has no reference to put in the subject.
 */
export async function sendEnquiryAnswerEmail(
  to: string,
  enquiry: Omit<EnquiryAnswerEmailProps, "appUrl" | "replyable">,
) {
  // The one mail that is either kind: a question carrying a reference is about a charter, and
  // the answer to it belongs with the people running that charter.
  const mailbox: Mailbox = enquiry.reference ? "booking" : "general";
  const html = await render(
    createElement(EnquiryAnswerEmail, {
      ...enquiry,
      replyable: isReplyable(mailbox),
      appUrl: env.CORS_ORIGIN,
    }),
  );
  const subject = enquiry.reference
    ? `Re: your question about booking ${enquiry.reference}`
    : "Re: your enquiry — YachtSkanner";
  return sendHtml(to, subject, html, { mailbox });
}

/** The receipt for a question about a booking, sent as it arrives; the answer follows later. */
export async function sendEnquiryReceivedEmail(
  to: string,
  enquiry: Omit<EnquiryReceivedEmailProps, "appUrl" | "replyable">,
) {
  const html = await render(
    createElement(EnquiryReceivedEmail, {
      ...enquiry,
      replyable: isReplyable("booking"),
      appUrl: env.CORS_ORIGIN,
    }),
  );
  return sendHtml(to, `We have your question about booking ${enquiry.reference}`, html, {
    mailbox: "booking",
  });
}

/**
 * The internal ping. `to` is the staff address from the environment; with none configured the
 * caller skips this entirely, which is why there is no fallback recipient here — guessing one
 * would mean mailing a customer an internal alert.
 */
export async function sendStaffAlertEmail(to: string, alert: Omit<StaffAlertEmailProps, "appUrl">) {
  const html = await render(createElement(StaffAlertEmail, { ...alert, appUrl: env.CORS_ORIGIN }));
  return sendHtml(to, alert.title, html, { mailbox: "none" });
}

/**
 * The first mail a new account gets. Sent after sign-up succeeded, so it promises nothing the
 * account cannot already do: no link here has to work for the customer to get in. The account
 * guest checkout opens is not a sign-up and gets `sendSetPasswordEmail` instead.
 */
export async function sendWelcomeEmail({ to, name }: { to: string; name?: string }) {
  // Templates are English-only, so the links are too, rather than guessing a locale the
  // sign-up never told us. Same constant the api services compose their links with.
  const base = `${env.CORS_ORIGIN}/en`;
  const html = await render(
    createElement(WelcomeEmail, {
      name,
      email: to,
      profileUrl: `${base}/profile`,
      wishlistUrl: `${base}/wishlist`,
      supportUrl: `${base}/support`,
      replyable: isReplyable("general"),
      appUrl: env.CORS_ORIGIN,
    }),
  );
  return sendHtml(to, "Welcome to YachtSkanner", html);
}

export async function sendResetPasswordEmail({ to, url }: { to: string; url: string }) {
  // The footer links back to the deployed web app; CORS_ORIGIN is that origin.
  const html = await render(createElement(ResetPasswordEmail, { url, appUrl: env.CORS_ORIGIN }));
  return sendHtml(to, "Reset your YachtSkanner password", html);
}

/**
 * The same single-use link as the reset mail, for an account that has never had a password —
 * one provisioned by guest checkout. Separate template because "reset" is wrong copy for a
 * first password, and the recipient did not ask for anything.
 */
export async function sendSetPasswordEmail({
  to,
  url,
  name,
}: {
  to: string;
  url: string;
  name?: string;
}) {
  const html = await render(
    createElement(SetPasswordEmail, { url, name, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, "Set your YachtSkanner password", html);
}
