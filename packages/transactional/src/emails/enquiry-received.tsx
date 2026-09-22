/** @jsxImportSource react */
/*
 * EnquiryReceivedEmail — the receipt for a question asked about a booking, most often from the
 * payment step instead of paying. Without it the customer's only trace of the question was the
 * screen they left: nothing in the inbox said it had arrived, and the hold kept running down
 * with no word on it. The question is quoted back, the hold named while there is one, and the
 * button goes where `enquiry-answer` sends it. Every piece this is drawn with comes from
 * ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  Divider,
  Eyebrow,
  Fact,
  FactList,
  Intro,
  Note,
  Quote,
  Title,
} from "./_components/ui";

export type EnquiryReceivedEmailProps = {
  customerName: string;
  reference: string;
  yachtName: string;
  checkIn: string;
  checkOut: string;
  question: string;
  /** Only while the booking is still an unpaid hold; a paid charter has nothing running out. */
  holdExpiresAt?: string;
  cta: { url: string; label: string };
  /** Whether a reply reaches anyone; see `EnquiryAnswerEmailProps.replyable`. */
  replyable: boolean;
  appUrl?: string;
};

export function EnquiryReceivedEmail({
  customerName,
  reference,
  yachtName,
  checkIn,
  checkOut,
  question,
  holdExpiresAt,
  cta,
  replyable,
  appUrl,
}: EnquiryReceivedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`We have your question about ${yachtName}`}
      eyebrow="Support"
      appUrl={appUrl}
    >
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>We have your question</Title>
      <Intro>
        {customerName}, thank you for writing. Our team is looking into it and will email you the
        answer.
      </Intro>

      <Quote label="You asked">{question}</Quote>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
        {holdExpiresAt ? <Fact label="Held until" value={holdExpiresAt} /> : null}
      </FactList>

      {holdExpiresAt ? (
        <Note>
          Asking does not extend the hold. If the answer is what you needed, pay before it runs out,
          or the operator can release the yacht.
        </Note>
      ) : null}

      <ActionButton href={cta.url}>{cta.label}</ActionButton>

      <Divider />
      <Note>
        {replyable
          ? "Something to add? Reply to this email and it joins the same question."
          : "Something to add? Ask again from your booking and it reaches the same team."}
      </Note>
    </EmailLayout>
  );
}

EnquiryReceivedEmail.PreviewProps = {
  customerName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 42 White Waves",
  checkIn: "Oct 3, 2026",
  checkOut: "Oct 10, 2026",
  question: "Do you need to see a sailing licence before departure?",
  holdExpiresAt: "Sep 25, 2026, 00:44 UTC",
  cta: { url: "https://example.com/en/bookings/bkg_preview/pay", label: "Complete your payment" },
  replyable: true,
} satisfies EnquiryReceivedEmailProps;

export default EnquiryReceivedEmail;
