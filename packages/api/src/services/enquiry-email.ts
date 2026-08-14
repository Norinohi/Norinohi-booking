import { env } from "@yacht-charter/env/server";
import { sendEnquiryAnswerEmail, sendStaffAlertEmail } from "@yacht-charter/transactional";

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
};

export async function notifyEnquiryAnswered(enquiry: EnquiryAnswered): Promise<void> {
  try {
    await sendEnquiryAnswerEmail(enquiry.to, {
      customerName: enquiry.customerName,
      reference: enquiry.reference,
      yachtName: enquiry.yachtName,
      question: enquiry.question,
      answer: enquiry.answer,
      cta: { url: appUrl(`/bookings/${enquiry.bookingId}`), label: "View your booking" },
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
