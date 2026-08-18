/** @jsxImportSource react */
/*
 * PaymentReceivedEmail — the receipt for one payment, sent when the money actually lands rather
 * than when someone pressed Pay. Stripe's own receipt covers a card charge and nothing covered a
 * bank transfer at all, so a customer who paid by invoice heard nothing between sending the money
 * and the charter being confirmed.
 *
 * One payment, not the booking. A deposit charter pays twice and each one gets its own receipt,
 * which is why the amount here is the amount of this charge and the totals below it are the
 * booking's. Only the card's middle content lives here; the frame comes from EmailLayout. Keep
 * exactly one jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type PaymentReceivedEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  amount: string;
  paidAt: string;
  /** How the money arrived, in the customer's words rather than the schema's. */
  method: "card" | "bank transfer";
  /**
   * Which installment this was, already in prose: "deposit", "balance", "full payment". The
   * schema's own names are not sendable, and picking the wording is the sender's job because
   * it is the half of this package that knows the locale.
   */
  kind: string;
  total: string;
  paidTotal: string;
  outstanding: string;
  /** When the rest falls due. Absent once nothing is left to pay. */
  balanceDueAt?: string;
  bookingUrl: string;
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
  paidValue: { margin: 0, fontSize: "16px", fontWeight: "700", color: colors.heading },

  factRow: {
    margin: 0,
    padding: "11px 0",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: "14px",
    lineHeight: "1.5",
  },
  factLabel: { color: colors.muted },
  factValue: { fontWeight: "700", color: colors.heading },

  moneyBox: {
    margin: "20px 0 0",
    padding: "18px 20px",
    backgroundColor: colors.page,
    borderRadius: "12px",
  },
  moneyRow: { margin: 0, padding: "4px 0", fontSize: "14px", color: colors.text },
  moneyLabel: { color: colors.muted },
  moneyValue: { fontWeight: "700", color: colors.heading, textAlign: "right" },

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

function Money({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Row style={styles.moneyRow}>
      <Column>
        <Text style={{ ...styles.moneyRow, ...styles.moneyLabel }}>{label}</Text>
      </Column>
      <Column>
        <Text style={{ ...styles.moneyRow, ...styles.moneyValue }}>{value}</Text>
      </Column>
    </Row>
  );
}

export function PaymentReceivedEmail({
  guestName,
  reference,
  yachtName,
  amount,
  paidAt,
  method,
  kind,
  total,
  paidTotal,
  outstanding,
  balanceDueAt,
  bookingUrl,
  supportUrl,
  appUrl,
}: PaymentReceivedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`${amount} received — booking ${reference}`}
      eyebrow="Payment"
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>We have your payment</Heading>
      <Text style={styles.intro}>
        {guestName}, your {kind} for {yachtName} arrived. Keep this as your receipt.
      </Text>

      <Section style={styles.amountBox}>
        <Row>
          <Column>
            <Text style={styles.amountLabel}>Received</Text>
            <Text style={styles.amountValue}>{amount}</Text>
          </Column>
          <Column>
            <Text style={styles.amountLabel}>On</Text>
            <Text style={styles.paidValue}>{paidAt}</Text>
          </Column>
        </Row>
      </Section>

      <Section>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Paid by" value={method} />
        <Fact label="Reference" value={reference} />
      </Section>

      <Section style={styles.moneyBox}>
        <Money label="Charter total" value={total} />
        <Money label="Paid so far" value={paidTotal} />
        <Money label="Still to pay" value={outstanding} />
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={bookingUrl} style={styles.button}>
          View your booking
        </Button>
      </Section>

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        {balanceDueAt
          ? `The rest is due by ${balanceDueAt}, and we will remind you before then.`
          : "Nothing is left to pay on this charter."}
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

PaymentReceivedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  amount: "€2,435",
  paidAt: "12 Feb 2026",
  method: "card",
  kind: "deposit",
  total: "€4,870",
  paidTotal: "€2,435",
  outstanding: "€2,435",
  balanceDueAt: "1 Aug 2026",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies PaymentReceivedEmailProps;

export default PaymentReceivedEmail;
