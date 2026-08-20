/** @jsxImportSource react */
/*
 * LeadFollowUpEmail — the acknowledgement every enquiry gets: Request Quote on a yacht, Contact
 * a charter expert, and Get Consultation from the trip planner. One template for all three
 * because the promise is the same — a person has it and will reply — and only the opening line
 * and the yacht block differ. The suggested yacht travels as a link so the customer can reopen
 * what they were looking at from the email rather than searching for it again. Only the card's
 * middle content lives here; the frame comes from EmailLayout and every piece it is drawn with
 * comes from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  Divider,
  Fact,
  FactList,
  GroupLabel,
  Intro,
  Note,
  Quote,
  SupportLink,
  Title,
} from "./_components/ui";

export type LeadKind = "quote_request" | "charter_expert" | "consultation";

export type LeadFollowUpEmailProps = {
  name: string;
  kind: LeadKind;
  /** Echoed back so the customer keeps a copy of what they asked. */
  message?: string;
  /** The yacht the enquiry was about, or the one the planner suggested. */
  yacht?: { name: string; url: string; imageUrl?: string };
  /**
   * Whether a reply actually reaches anyone. Set by the sender from `REPLY_TO_EMAIL`, because
   * without it the mail goes out under a sending identity that is usually a noreply, and
   * "reply to this email" is then an instruction into a bin.
   */
  replyable: boolean;
  appUrl?: string;
  supportUrl?: string;
};

const OPENINGS = {
  quote_request:
    "thanks for asking about this yacht. A charter expert is checking its availability and the best price for your dates, and will come back to you within one working day.",
  charter_expert:
    "thanks for getting in touch. A charter expert has your message and will reply within one working day.",
  consultation:
    "thanks for telling us about your trip. A charter expert is putting together options that match what you described and will be in touch within one working day.",
} satisfies Record<LeadKind, string>;

const EYEBROWS = {
  quote_request: "Quote request",
  charter_expert: "Enquiry",
  consultation: "Consultation",
} satisfies Record<LeadKind, string>;

export function LeadFollowUpEmail({
  name,
  kind,
  message,
  yacht,
  replyable,
  supportUrl,
  appUrl,
}: LeadFollowUpEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview="We have your enquiry — a charter expert will be in touch"
      eyebrow={EYEBROWS[kind]}
      hero={yacht?.imageUrl ? { src: yacht.imageUrl, alt: yacht.name } : undefined}
      appUrl={appUrl}
    >
      <Title>We have your enquiry</Title>
      <Intro>
        {name}, {OPENINGS[kind]}
      </Intro>

      {message ? <Quote label="What you sent us">{message}</Quote> : null}

      {yacht ? (
        <>
          <GroupLabel>
            {kind === "consultation" ? "The yacht we suggested" : "The yacht you asked about"}
          </GroupLabel>
          <FactList>
            <Fact label="Yacht" value={yacht.name} />
          </FactList>
          <ActionButton href={yacht.url}>View the yacht</ActionButton>
        </>
      ) : null}

      <Divider />
      <Note>
        {replyable
          ? "Anything to add, or a question in the meantime? Reply to this email and it reaches the same person, or use the link below."
          : "Anything to add, or a question in the meantime? Use the link below and it reaches the same person."}
      </Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

LeadFollowUpEmail.PreviewProps = {
  name: "John",
  kind: "consultation",
  message: "We're four friends, first time sailing, looking for something calm in early September.",
  yacht: {
    name: "Lagoon 42 — Aurora",
    url: "https://example.com/en/yachts/aurora-lagoon-42",
    imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1024",
  },
  replyable: true,
  supportUrl: "https://example.com/en/support",
} satisfies LeadFollowUpEmailProps;

export default LeadFollowUpEmail;
