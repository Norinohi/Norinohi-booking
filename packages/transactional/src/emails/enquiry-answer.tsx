/** @jsxImportSource react */
/*
 * EnquiryAnswerEmail — the reply staff send from the inbox, to a question about an existing
 * booking or to a pre-booking enquiry. The question is quoted back because it may have been
 * asked days ago and from a different device, and the call to action links whatever the reply
 * is about: the booking, or the yacht the enquiry named. A pre-booking lead has neither a
 * reference nor, when the visitor left the message box empty, a question to quote — both are
 * therefore optional. Every piece this is drawn with comes from ./_components/ui. Keep exactly
 * one jsx-source annotation in this file.
 */
import { Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  Divider,
  Eyebrow,
  GroupLabel,
  Intro,
  Note,
  Quote,
  Title,
} from "./_components/ui";

export type EnquiryAnswerEmailProps = {
  customerName: string;
  /** Present when the reply is about a booking; absent for a pre-booking enquiry. */
  reference?: string;
  yachtName?: string;
  question?: string;
  answer: string;
  cta?: { url: string; label: string };
  /**
   * Whether a reply actually reaches anyone. Set by the sender from `REPLY_TO_EMAIL`, because
   * without it the mail goes out under a sending identity that is usually a noreply, and
   * "reply to this email" is then an instruction into a bin.
   */
  replyable: boolean;
  appUrl?: string;
};

/* The one block in the set that is somebody's prose rather than a field, so it is set slightly
   larger than body copy and keeps the line breaks the writer typed. */
const answerStyle = {
  margin: 0,
  fontSize: "15px",
  lineHeight: "1.7",
  color: colors.heading,
  whiteSpace: "pre-wrap",
} as const;

export function EnquiryAnswerEmail({
  customerName,
  reference,
  yachtName,
  question,
  answer,
  cta,
  replyable,
  appUrl,
}: EnquiryAnswerEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`Re: your question about ${yachtName ?? "your enquiry"}`}
      eyebrow="Support"
      appUrl={appUrl}
    >
      {reference ? <Eyebrow>Booking {reference}</Eyebrow> : null}
      <Title>About your question</Title>
      <Intro>{customerName}, here is the answer from our team.</Intro>

      {question ? <Quote label="You asked">{question}</Quote> : null}

      <GroupLabel>Our answer</GroupLabel>
      <Text style={answerStyle}>{answer}</Text>

      {cta ? <ActionButton href={cta.url}>{cta.label}</ActionButton> : null}

      <Divider />
      <Note>
        {replyable
          ? "Still not clear? Reply to this email and the same person picks it up."
          : "Still not clear? Ask again from the site and the same person picks it up."}
      </Note>
    </EmailLayout>
  );
}

EnquiryAnswerEmail.PreviewProps = {
  customerName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  question: "Do you need to see a sailing licence before departure?",
  answer:
    "Yes — please bring the skipper's licence and one ID for each guest. The base checks them at the briefing, and a photo on your phone is fine as a backup.",
  cta: { url: "https://example.com/en/bookings/bkg_preview/pay", label: "Complete your payment" },
  replyable: true,
} satisfies EnquiryAnswerEmailProps;

export default EnquiryAnswerEmail;
