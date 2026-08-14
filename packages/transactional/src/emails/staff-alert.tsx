/** @jsxImportSource react */
/*
 * StaffAlertEmail — the internal ping when something lands that a person has to act on: a new
 * enquiry, or a new question on a booking. Deliberately plain and dense — it goes to a
 * colleague's inbox next to fifty others, so the subject and the first two lines have to say
 * what it is and how urgent, and the link does the rest. Keep exactly one jsx-source annotation
 * in this file.
 */
import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type StaffAlertEmailProps = {
  title: string;
  /** Label/value pairs — who it is from, which booking, which yacht. */
  facts: { label: string; value: string }[];
  /** The customer's own words, when there are any. */
  body?: string;
  actionUrl: string;
  actionLabel: string;
  appUrl?: string;
};

const styles = {
  heading: {
    margin: "0 0 16px",
    fontFamily,
    fontSize: "22px",
    lineHeight: "1.25",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  row: {
    margin: 0,
    padding: "9px 0",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: "14px",
    lineHeight: "1.5",
  },
  label: { color: colors.muted },
  value: { fontWeight: "700", color: colors.heading },
  bodyLabel: { margin: "20px 0 6px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  body: {
    margin: 0,
    padding: "14px 16px",
    backgroundColor: colors.page,
    borderRadius: "10px",
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.text,
    whiteSpace: "pre-wrap",
  },
  buttonRow: { margin: "24px 0 0" },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    fontWeight: "700",
    padding: "13px 26px",
    borderRadius: "8px",
    textDecoration: "none",
  },
} as const;

export function StaffAlertEmail({
  title,
  facts,
  body,
  actionUrl,
  actionLabel,
  appUrl,
}: StaffAlertEmailProps): React.ReactElement {
  return (
    <EmailLayout preview={title} eyebrow="Internal" appUrl={appUrl}>
      <Heading style={styles.heading}>{title}</Heading>

      <Section>
        {facts.map((fact) => (
          <Text key={fact.label} style={styles.row}>
            <span style={styles.label}>{fact.label}: </span>
            <span style={styles.value}>{fact.value}</span>
          </Text>
        ))}
      </Section>

      {body ? (
        <>
          <Text style={styles.bodyLabel}>Message</Text>
          <Text style={styles.body}>{body}</Text>
        </>
      ) : null}

      <Section style={styles.buttonRow}>
        <Button href={actionUrl} style={styles.button}>
          {actionLabel}
        </Button>
      </Section>
    </EmailLayout>
  );
}

StaffAlertEmail.PreviewProps = {
  title: "New question on booking NB-T93Q9JFL",
  facts: [
    { label: "From", value: "John Doe (john@example.com)" },
    { label: "Yacht", value: "Lagoon 50 — 6 + 2 cab." },
    { label: "Charter", value: "15 Aug 2026 → 22 Aug 2026" },
  ],
  body: "Do you need to see a sailing licence before departure?",
  actionUrl: "https://example.com/en/inbox",
  actionLabel: "Open the inbox",
} satisfies StaffAlertEmailProps;

export default StaffAlertEmail;
