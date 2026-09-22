import { env } from "@yacht-charter/env/server";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { log, parseError } from "evlog";
import {
  sendEnquiryAnswerEmail,
  sendEnquiryReceivedEmail,
  sendStaffAlertEmail,
} from "@yacht-charter/transactional";

import { emailDay, emailInstant } from "../lib/email-dates";
import { BOOKING_RECEIVED_STATES, type BookingStatus } from "./booking-state";

/*
 * The mails around a booking enquiry: the receipt the customer gets as they ask, the ping that
 * tells staff one arrived, and the reply that reaches the customer later. Both are best-effort — a question that was recorded must stay
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
    log.error({
      action: "email.failed",
      email: "enquiry_answer",
      reference: enquiry.reference,
      ...thrownFields(parseError(cause)),
    });
  }
}

export type EnquiryReceived = {
  to: string;
  customerName: string;
  reference: string;
  yachtName: string;
  checkIn: string;
  checkOut: string;
  question: string;
  bookingId: string;
  bookingStatus: BookingStatus;
  holdExpiresAt: Date | null;
};

export async function notifyEnquiryReceived(enquiry: EnquiryReceived): Promise<void> {
  const cta = answerCta(enquiry.bookingId, enquiry.bookingStatus);
  const holding = BOOKING_RECEIVED_STATES.some((status) => status === enquiry.bookingStatus);

  try {
    await sendEnquiryReceivedEmail(enquiry.to, {
      customerName: enquiry.customerName,
      reference: enquiry.reference,
      yachtName: enquiry.yachtName,
      checkIn: emailDay(enquiry.checkIn),
      checkOut: emailDay(enquiry.checkOut),
      question: enquiry.question,
      holdExpiresAt:
        holding && enquiry.holdExpiresAt ? emailInstant(enquiry.holdExpiresAt) : undefined,
      cta,
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "enquiry_received",
      reference: enquiry.reference,
      ...thrownFields(parseError(cause)),
    });
  }
}

export type StaffAlert = {
  title: string;
  facts: { label: string; value: string }[];
  body?: string;
  /** App-relative, e.g. `/inbox` — the alert links staff straight at the queue. */
  path: string;
  actionLabel: string;
  /**
   * Which desk this is for. `booking` is about a charter that already exists and belongs with
   * whoever runs it; `general` is someone who has not booked anything yet. The same split the
   * customer-facing reply-to addresses make, on the internal side, so an answer typed into
   * either alert stays in the thread it came from.
   */
  audience: "booking" | "general";
};

/** Mirrors `replyToFor` in the transactional package: unset falls back rather than going quiet. */
function staffInbox(audience: StaffAlert["audience"]): string | undefined {
  if (audience === "booking") return env.BOOKING_STAFF_EMAIL ?? env.STAFF_EMAIL;
  return env.STAFF_EMAIL;
}

/**
 * The internal announcement. Silently does nothing when no staff address is configured, which is
 * the state on a local machine: nothing is queued or retried, because the inbox is the durable
 * record and this is only the tap on the shoulder.
 */
export async function notifyStaff(alert: StaffAlert): Promise<void> {
  const to = staffInbox(alert.audience);
  if (!to) return;

  try {
    await sendStaffAlertEmail(to, {
      title: alert.title,
      facts: alert.facts,
      body: alert.body,
      actionUrl: appUrl(alert.path),
      actionLabel: alert.actionLabel,
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "staff_alert",
      title: alert.title,
      ...thrownFields(parseError(cause)),
    });
  }
}
