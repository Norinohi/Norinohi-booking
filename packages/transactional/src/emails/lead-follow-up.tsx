/** @jsxImportSource react */
/*
 * LeadFollowUpEmail — the acknowledgement every enquiry gets: Request Quote on a yacht, Contact
 * a charter expert, and Get Consultation from the trip planner. One template for all three
 * because the promise is the same — a person has it and will reply — and only the opening line
 * and the yacht block differ. The suggested yacht travels as a link so the customer can reopen
 * what they were looking at from the email rather than searching for it again. Only the card's
 * middle content lives here; the frame comes from EmailLayout. Keep exactly one jsx-source
 * annotation in this file.
 */
import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type LeadKind = "quote_request" | "charter_expert" | "consultation";

export type LeadFollowUpEmailProps = {
  name: string;
  kind: LeadKind;
  /** Echoed back so the customer keeps a copy of what they asked. */
  message?: string;
  /** The yacht the enquiry was about, or the one the planner suggested. */
  yacht?: { name: string; url: string; imageUrl?: string };
  supportUrl?: string;
  appUrl?: string;
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

const styles = {
  heading: {
    margin: "0 0 14px",
    fontFamily,
    fontSize: "24px",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  intro: { margin: "0 0 24px", fontSize: "15px", lineHeight: "1.6", color: colors.text },
  quotedLabel: { margin: "0 0 6px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  quoted: {
    margin: "0 0 24px",
    padding: "14px 16px",
    backgroundColor: colors.page,
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.text,
    whiteSpace: "pre-wrap",
  },
  yachtLabel: { margin: "0 0 6px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  yachtName: {
    margin: "0 0 16px",
    fontSize: "17px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
  },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    fontWeight: "600",
    padding: "14px 28px",
    borderRadius: "8px",
    textDecoration: "none",
  },
  divider: { margin: "28px 0 20px", border: "none", borderTop: `1px solid ${colors.border}` },
  note: { margin: "0 0 12px", fontSize: "13px", lineHeight: "1.6", color: colors.muted },
  link: { fontSize: "13px", lineHeight: "1.6", color: colors.brand },
} as const;

export function LeadFollowUpEmail({
  name,
  kind,
  message,
  yacht,
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
      <Heading style={styles.heading}>We have your enquiry</Heading>
      <Text style={styles.intro}>
        {name}, {OPENINGS[kind]}
      </Text>

      {message ? (
        <>
          <Text style={styles.quotedLabel}>What you sent us</Text>
          <Text style={styles.quoted}>{message}</Text>
        </>
      ) : null}

      {yacht ? (
        <Section>
          <Text style={styles.yachtLabel}>
            {kind === "consultation" ? "The yacht we suggested" : "The yacht you asked about"}
          </Text>
          <Text style={styles.yachtName}>{yacht.name}</Text>
          <Button href={yacht.url} style={styles.button}>
            View the yacht
          </Button>
        </Section>
      ) : null}

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        Anything to add, or a question in the meantime? Reply to this email and it reaches the same
        person, or use the link below.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support
        </Link>
      ) : null}
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
  supportUrl: "https://example.com/en/support",
} satisfies LeadFollowUpEmailProps;

export default LeadFollowUpEmail;
