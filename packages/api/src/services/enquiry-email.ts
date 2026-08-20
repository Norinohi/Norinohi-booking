import { env } from "@yacht-charter/env/server";
import { sendEnquiryAnswerEmail, sendStaffAlertEmail } from "@yacht-charter/transactional";

import { BOOKING_RECEIVED_STATES, type BookingStatus } from "./booking-state";

/*
 * The two mails around a booking enquiry: the ping that tells staff one arrived, and the reply
 * that reaches the customer. Both are best-effort — a question that was recorded must stay
 * recorded whether or not Resend answered, and the inbox at /inbox shows it either way.
 */

/** The locale the emails are written in. Templates are English-only for now. */
const LOCALE = "en";

function appUrl(path: string): string {
  return `${env.CORS_ORIGIN}/${LOCALE}${path}`;
}

export type EnquiryAnswered = {
  to: string;
  customerName: string;
  reference: string;
  yachtName: string;
  question: string;
  answer: string;
  bookingId: string;
  /** Decides where the button goes: a charter nobody has paid for needs the payment screen. */
  bookingStatus: BookingStatus;
};

/**
 * The one button on the reply.
 *
 * A question is most often asked while deciding whether to pay, and sending that customer to the
 * booking page under "View your booking" was the complaint that started this: the answer they
 * just read is the thing that unblocks the payment, and the mail pointed away from it.
 * `BOOKING_RECEIVED_STATES` is the same list the holding mail uses to decide that its pay link is
 * what this customer needs, so the two agree by construction rather than by memory.
 */
function answerCta(bookingId: string, status: BookingStatus): { url: string; label: string } {
  const awaitingPayment: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;

  return awaitingPayment.includes(status)
    ? { url: appUrl(`/bookings/${bookingId}/pay`), label: "Complete your payment" }
    : { url: appUrl(`/bookings/${bookingId}`), label: "View your booking" };
}

export async function notifyEnquiryAnswered(enquiry: EnquiryAnswered): Promise<void> {
  try {
    await sendEnquiryAnswerEmail(enquiry.to, {
      customerName: enquiry.customerName,
      reference: enquiry.reference,
      yachtName: enquiry.yachtName,
      question: enquiry.question,
      answer: enquiry.answer,
      cta: answerCta(enquiry.bookingId, enquiry.bookingStatus),
    });
  } catch (cause) {
    console.error(`[email] enquiry answer for ${enquiry.reference} failed`, cause);
  }
}

export type StaffAlert = {
  title: string;
  facts: { label: string; value: string }[];
  body?: string;
  /** App-relative, e.g. `/inbox` — the alert links staff straight at the queue. */
  path: string;
  actionLabel: string;
};

/**
 * The internal announcement. Silently does nothing when `STAFF_EMAIL` is unset, which is the
 * configured state for a local machine: nothing is queued or retried, because the inbox is the
 * durable record and this is only the tap on the shoulder.
 */
export async function notifyStaff(alert: StaffAlert): Promise<void> {
  if (!env.STAFF_EMAIL) return;

  try {
    await sendStaffAlertEmail(env.STAFF_EMAIL, {
      title: alert.title,
      facts: alert.facts,
      body: alert.body,
      actionUrl: appUrl(alert.path),
      actionLabel: alert.actionLabel,
    });
  } catch (cause) {
    console.error(`[email] staff alert "${alert.title}" failed`, cause);
  }
}
