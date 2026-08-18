import { render } from "@react-email/render";
import { env } from "@yacht-charter/env/server";
import { createElement } from "react";
import { Resend } from "resend";

import {
  BookingConfirmationEmail,
  type BookingConfirmationEmailProps,
} from "./emails/booking-confirmation";
import { EnquiryAnswerEmail, type EnquiryAnswerEmailProps } from "./emails/enquiry-answer";
import { InvoiceIssuedEmail, type InvoiceIssuedEmailProps } from "./emails/invoice-issued";
import { LeadFollowUpEmail, type LeadFollowUpEmailProps } from "./emails/lead-follow-up";
import { RefundIssuedEmail, type RefundIssuedEmailProps } from "./emails/refund-issued";
import { ResetPasswordEmail } from "./emails/reset-password";
import { SetPasswordEmail } from "./emails/set-password";
import { StaffAlertEmail, type StaffAlertEmailProps } from "./emails/staff-alert";

let client: Resend | undefined;

function getClient() {
  if (!env.RESEND_API_KEY) return undefined;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

// Optional as a pair like the Google/Stripe keys: without RESEND_API_KEY and EMAIL_FROM
// sends are skipped rather than the server failing to boot. Callers read `skipped` to
// decide whether to surface the link some other way (e.g. a local dev log).
async function sendHtml(to: string, subject: string, html: string) {
  const resend = getClient();
  if (!resend || !env.EMAIL_FROM) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not configured, skipping send to ${to}`);
    return { skipped: true } as const;
  }

  const result = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { skipped: false, id: result.data?.id } as const;
}

/**
 * The booking receipt, sent as soon as a booking is held.
 *
 * Everything is pre-formatted by the caller: money and dates belong to the booking's currency
 * and the customer's locale, neither of which this package knows. The subject carries the
 * reference so a later "what was my booking number" search finds it.
 */
export async function sendBookingConfirmationEmail(
  to: string,
  booking: Omit<BookingConfirmationEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(BookingConfirmationEmail, { ...booking, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `Your booking ${booking.reference} — ${booking.yachtName}`, html);
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
  return sendHtml(to, `Invoice ${invoice.invoiceNumber} — ${invoice.amount} due`, html);
}

/** Confirmation that money went back, sent once a refund has actually settled. */
export async function sendRefundIssuedEmail(
  to: string,
  refund: Omit<RefundIssuedEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(RefundIssuedEmail, { ...refund, appUrl: env.CORS_ORIGIN }),
  );
  return sendHtml(to, `${refund.refunded} refunded — booking ${refund.reference}`, html);
}

/** The acknowledgement an enquiry gets — quote request, charter expert, or consultation. */
export async function sendLeadFollowUpEmail(
  to: string,
  lead: Omit<LeadFollowUpEmailProps, "appUrl">,
) {
  const html = await render(createElement(LeadFollowUpEmail, { ...lead, appUrl: env.CORS_ORIGIN }));
  return sendHtml(to, "We have your enquiry — YachtSkanner", html);
}

/**
 * The reply staff send from the inbox — to a question about a booking, or to a pre-booking
 * enquiry, which has no reference to put in the subject.
 */
export async function sendEnquiryAnswerEmail(
  to: string,
  enquiry: Omit<EnquiryAnswerEmailProps, "appUrl">,
) {
  const html = await render(
    createElement(EnquiryAnswerEmail, { ...enquiry, appUrl: env.CORS_ORIGIN }),
  );
  const subject = enquiry.reference
    ? `Re: your question about booking ${enquiry.reference}`
    : "Re: your enquiry — YachtSkanner";
  return sendHtml(to, subject, html);
}

/**
 * The internal ping. `to` is the staff address from the environment; with none configured the
 * caller skips this entirely, which is why there is no fallback recipient here — guessing one
 * would mean mailing a customer an internal alert.
 */
export async function sendStaffAlertEmail(to: string, alert: Omit<StaffAlertEmailProps, "appUrl">) {
  const html = await render(createElement(StaffAlertEmail, { ...alert, appUrl: env.CORS_ORIGIN }));
  return sendHtml(to, alert.title, html);
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
