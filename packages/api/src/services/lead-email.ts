import { env } from "@yacht-charter/env/server";
import { sendLeadFollowUpEmail } from "@yacht-charter/transactional";

import type { LeadKind } from "../contracts/lead";

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
}
