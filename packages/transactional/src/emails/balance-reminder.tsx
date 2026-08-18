/** @jsxImportSource react */
/*
 * BalanceReminderEmail — the nudge before a confirmed booking's second installment falls due.
 * A deposit-policy charter takes the balance weeks or months later, by which time the customer
 * has long left the site; without this the first they hear of the date is the day it passes.
 *
 * Deliberately not a warning. The booking is confirmed and nothing is wrong yet, so the tone is
 * a reminder with a pay link, and the consequence is stated once rather than repeated. Only the
 * card's middle content lives here; the frame comes from EmailLayout. Keep exactly one
 * jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type BalanceReminderEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  amount: string;
  dueAt: string;
  checkIn: string;
  checkOut: string;
  payUrl: string;
  supportUrl?: string;
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
    margin: "0 0 10px",
    fontFamily,
    fontSize: "26px",
    lineHeight: "1.2",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  intro: { margin: "0 0 24px", fontSize: "15px", lineHeight: "1.6", color: colors.text },

  amountBox: { padding: "18px 20px", backgroundColor: colors.page, borderRadius: "12px" },
  amountLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  amountValue: { margin: 0, fontSize: "26px", fontWeight: "800", color: colors.heading },
  dueValue: { margin: 0, fontSize: "16px", fontWeight: "700", color: colors.heading },

  factRow: {
    margin: 0,
    padding: "11px 0",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: "14px",
    lineHeight: "1.5",
  },
  factLabel: { color: colors.muted },
  factValue: { fontWeight: "700", color: colors.heading },

  buttonRow: { margin: "28px 0 0", textAlign: "center" },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    fontWeight: "700",
    padding: "15px 34px",
    borderRadius: "8px",
    textDecoration: "none",
  },
  divider: { margin: "28px 0 18px", border: "none", borderTop: `1px solid ${colors.border}` },
  note: { margin: "0 0 8px", fontSize: "13px", lineHeight: "1.6", color: colors.muted },
  link: { fontSize: "13px", lineHeight: "1.6", color: colors.brand, fontWeight: "600" },
} as const;

function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Text style={styles.factRow}>
      <span style={styles.factLabel}>{label}: </span>
      <span style={styles.factValue}>{value}</span>
    </Text>
  );
}

export function BalanceReminderEmail({
  guestName,
  reference,
  yachtName,
  amount,
  dueAt,
  checkIn,
  checkOut,
  payUrl,
  supportUrl,
  appUrl,
}: BalanceReminderEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`${amount} due ${dueAt} — booking ${reference}`}
      eyebrow="Payment"
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>Your balance is due soon</Heading>
      <Text style={styles.intro}>
        {guestName}, {yachtName} is confirmed and the second payment is coming up. Nothing is wrong
        — this is the date you agreed at checkout.
      </Text>

      <Section style={styles.amountBox}>
        <Row>
          <Column>
            <Text style={styles.amountLabel}>Balance</Text>
            <Text style={styles.amountValue}>{amount}</Text>
          </Column>
          <Column>
            <Text style={styles.amountLabel}>Due by</Text>
            <Text style={styles.dueValue}>{dueAt}</Text>
          </Column>
        </Row>
      </Section>

      <Section>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={payUrl} style={styles.button}>
          Pay your balance
        </Button>
      </Section>

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        If the balance is not settled by the due date we may have to release the yacht. Tell us
        first if the date is a problem — we would rather sort it out than cancel a charter.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

BalanceReminderEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  amount: "€2,435",
  dueAt: "1 Aug 2026",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  payUrl: "https://example.com/en/bookings/bkg_preview/pay",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BalanceReminderEmailProps;

export default BalanceReminderEmail;
