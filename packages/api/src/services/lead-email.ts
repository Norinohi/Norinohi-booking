import { env } from "@yacht-charter/env/server";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { log, parseError } from "evlog";
import { sendEnquiryAnswerEmail, sendLeadFollowUpEmail } from "@yacht-charter/transactional";

import type { LeadKind } from "../contracts/lead";
import { notifyStaff } from "./enquiry-email";

/*
 * The enquiry acknowledgement. Same shape as ./booking-email: best-effort, because a recorded
 * enquiry that could not be emailed is still a recorded enquiry, and staff pick it up from admin
 * either way. Failures are logged, never thrown.
 */

/** The locale the email is written in. Templates are English-only for now. */
const LOCALE = "en";

function appUrl(path: string): string {
  return `${env.CORS_ORIGIN}/${LOCALE}${path}`;
}

const KIND_LABELS = {
  quote_request: "quote request",
  charter_expert: "expert enquiry",
  consultation: "consultation request",
  booking_request: "booking request",
} satisfies Record<LeadKind, string>;

export type LeadReceivedEmail = {
  to: string;
  name: string;
  kind: LeadKind;
  message?: string;
  /** The listing the enquiry names, or the one the planner recommended. */
  yacht?: { title: string; slug: string; mainImage: string | null };
  /** The charter the sidebar was showing, which a booking request is for. */
  charter?: { checkIn: string; checkOut: string; guests?: number; totalLabel?: string };
};

export async function notifyLeadReceived(lead: LeadReceivedEmail): Promise<void> {
  try {
    await sendLeadFollowUpEmail(lead.to, {
      name: lead.name,
      kind: lead.kind,
      message: lead.message,
      yacht: lead.yacht
        ? {
            name: lead.yacht.title,
            url: appUrl(`/yachts/${lead.yacht.slug}`),
            imageUrl: lead.yacht.mainImage ?? undefined,
          }
        : undefined,
      supportUrl: appUrl("/support"),
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "lead_follow_up",
      to: lead.to,
      ...thrownFields(parseError(cause)),
    });
  }

  await notifyStaff({
    title: `New ${KIND_LABELS[lead.kind]} from ${lead.name}`,
    facts: [
      { label: "From", value: `${lead.name} (${lead.to})` },
      { label: "Kind", value: KIND_LABELS[lead.kind] },
      ...(lead.yacht ? [{ label: "Yacht", value: lead.yacht.title }] : []),
      ...(lead.charter
        ? [
            { label: "Dates", value: `${lead.charter.checkIn} to ${lead.charter.checkOut}` },
            ...(lead.charter.guests
              ? [{ label: "Guests", value: String(lead.charter.guests) }]
              : []),
            ...(lead.charter.totalLabel
              ? [{ label: "Quoted", value: lead.charter.totalLabel }]
              : []),
          ]
        : []),
    ],
    body: lead.message,
    path: "/inbox",
    actionLabel: "Open the inbox",
    // A lead has no booking yet, whatever it is about — even a quote request naming a yacht.
    audience: "general",
  });
}

export type LeadAnswered = {
  to: string;
  name: string;
  /** What they wrote, when they wrote anything — the message box is optional on every form. */
  question?: string;
  answer: string;
  yacht?: { title: string; slug: string };
};

/**
 * The reply to a pre-booking enquiry. Same template as the booking-question answer, minus the
 * reference and the booking link: a lead has no booking, so the call to action points at the
 * yacht they asked about, and at nothing at all when they named none.
 */
export async function notifyLeadAnswered(lead: LeadAnswered): Promise<void> {
  try {
    await sendEnquiryAnswerEmail(lead.to, {
      customerName: lead.name,
      yachtName: lead.yacht?.title,
      question: lead.question,
      answer: lead.answer,
      cta: lead.yacht
        ? { url: appUrl(`/yachts/${lead.yacht.slug}`), label: "View the yacht" }
        : undefined,
    });
  } catch (cause) {
    log.error({
      action: "email.failed",
      email: "lead_answer",
      to: lead.to,
      ...thrownFields(parseError(cause)),
    });
  }
}
