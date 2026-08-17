/** @jsxImportSource react */
/*
 * EnquiryAnswerEmail — the reply staff send from the inbox, to a question about an existing
 * booking or to a pre-booking enquiry. The question is quoted back because it may have been
 * asked days ago and from a different device, and the call to action links whatever the reply
 * is about: the booking, or the yacht the enquiry named. A pre-booking lead has neither a
 * reference nor, when the visitor left the message box empty, a question to quote — both are
 * therefore optional. Keep exactly one jsx-source annotation in this file.
 */
import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type EnquiryAnswerEmailProps = {
  customerName: string;
  /** Present when the reply is about a booking; absent for a pre-booking enquiry. */
  reference?: string;
  yachtName?: string;
  question?: string;
  answer: string;
  cta?: { url: string; label: string };
  appUrl?: string;
};

const styles = {
  eyebrow: {
    margin: "0 0 6px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: colors.brand,
  },
  heading: {
    margin: "0 0 14px",
    fontFamily,
    fontSize: "24px",
    lineHeight: "1.2",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  intro: { margin: "0 0 24px", fontSize: "15px", lineHeight: "1.6", color: colors.text },
  label: { margin: "0 0 6px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  quoted: {
    margin: "0 0 24px",
    padding: "14px 16px",
    backgroundColor: colors.page,
    borderRadius: "10px",
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.text,
    whiteSpace: "pre-wrap",
  },
  answer: {
    margin: "0 0 8px",
    fontSize: "15px",
    lineHeight: "1.7",
    color: colors.heading,
    whiteSpace: "pre-wrap",
  },
  buttonRow: { margin: "28px 0 0" },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    fontWeight: "700",
    padding: "14px 28px",
    borderRadius: "8px",
    textDecoration: "none",
  },
  divider: { margin: "28px 0 18px", border: "none", borderTop: `1px solid ${colors.border}` },
  note: { margin: 0, fontSize: "13px", lineHeight: "1.6", color: colors.muted },
} as const;

export function EnquiryAnswerEmail({
  customerName,
  reference,
  yachtName,
  question,
  answer,
  cta,
  appUrl,
}: EnquiryAnswerEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`Re: your question about ${yachtName ?? "your enquiry"}`}
      eyebrow="Support"
      appUrl={appUrl}
    >
      {reference ? <Text style={styles.eyebrow}>Booking {reference}</Text> : null}
      <Heading style={styles.heading}>About your question</Heading>
      <Text style={styles.intro}>{customerName}, here is the answer from our team.</Text>

      {question ? (
        <>
          <Text style={styles.label}>You asked</Text>
          <Text style={styles.quoted}>{question}</Text>
        </>
      ) : null}

      <Text style={styles.label}>Our answer</Text>
      <Text style={styles.answer}>{answer}</Text>

      {cta ? (
        <Section style={styles.buttonRow}>
          <Button href={cta.url} style={styles.button}>
            {cta.label}
          </Button>
        </Section>
      ) : null}

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        Still not clear? Reply to this email and the same person picks it up.
      </Text>
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
  cta: { url: "https://example.com/en/bookings/bkg_preview", label: "View your booking" },
} satisfies EnquiryAnswerEmailProps;

export default EnquiryAnswerEmail;
