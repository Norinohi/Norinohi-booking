import { env } from "@yacht-charter/env/server";
import { sendLeadFollowUpEmail } from "@yacht-charter/transactional";

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
} satisfies Record<LeadKind, string>;

export type LeadReceivedEmail = {
  to: string;
  name: string;
  kind: LeadKind;
  message?: string;
  /** The listing the enquiry names, or the one the planner recommended. */
  yacht?: { title: string; slug: string; mainImage: string | null };
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
    console.error(`[email] lead follow-up to ${lead.to} failed`, cause);
  }

  await notifyStaff({
    title: `New ${KIND_LABELS[lead.kind]} from ${lead.name}`,
    facts: [
      { label: "From", value: `${lead.name} (${lead.to})` },
      { label: "Kind", value: KIND_LABELS[lead.kind] },
      ...(lead.yacht ? [{ label: "Yacht", value: lead.yacht.title }] : []),
    ],
    body: lead.message,
    path: "/inbox",
    actionLabel: "Open the inbox",
  });
}
