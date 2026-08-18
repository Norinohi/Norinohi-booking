/** @jsxImportSource react */
/*
 * RefundIssuedEmail — sent when money goes back. A cancelled charter is the one moment a
 * customer most wants written confirmation, and until this existed the only trace was a line
 * on their card statement days later.
 *
 * `outstanding` is present when only part of the money came back — a cancellation policy
 * retains a share, and saying nothing about the rest reads as a mistake rather than a term
 * they agreed to. Only the card's middle content lives here; the frame comes from EmailLayout.
 * Keep exactly one jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type RefundIssuedEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  refunded: string;
  /** Set when the refund was partial; omitted when everything came back. */
  outstanding?: string;
  reason?: string;
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

  amountBox: {
    padding: "18px 20px",
    backgroundColor: colors.page,
    borderRadius: "12px",
  },
  amountLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  amountValue: { margin: 0, fontSize: "26px", fontWeight: "800", color: colors.heading },
  outstandingValue: { margin: 0, fontSize: "16px", fontWeight: "700", color: colors.heading },

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

export function RefundIssuedEmail({
  guestName,
  reference,
  yachtName,
  refunded,
  outstanding,
  reason,
  bookingUrl,
  supportUrl,
  appUrl,
}: RefundIssuedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`${refunded} refunded — booking ${reference}`}
      eyebrow="Refund"
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>Your refund is on its way</Heading>
      <Text style={styles.intro}>
        {guestName}, we have returned the money below for {yachtName}. Card refunds usually appear
        on your statement within five to ten working days, depending on your bank.
      </Text>

      <Section style={styles.amountBox}>
        <Row>
          <Column>
            <Text style={styles.amountLabel}>Refunded</Text>
            <Text style={styles.amountValue}>{refunded}</Text>
          </Column>
          {outstanding ? (
            <Column>
              <Text style={styles.amountLabel}>Retained</Text>
              <Text style={styles.outstandingValue}>{outstanding}</Text>
            </Column>
          ) : null}
        </Row>
      </Section>

      {reason ? (
        <Section>
          <Text style={styles.factRow}>
            <span style={styles.factLabel}>Reason: </span>
            <span style={styles.factValue}>{reason}</span>
          </Text>
        </Section>
      ) : null}

      <Section style={styles.buttonRow}>
        <Button href={bookingUrl} style={styles.button}>
          View your booking
        </Button>
      </Section>

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        If the amount does not look right, or nothing has arrived after ten working days, tell us
        and we will chase it.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

RefundIssuedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  refunded: "€2,435",
  outstanding: "€487",
  reason: "Operator withdrew the yacht",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies RefundIssuedEmailProps;

export default RefundIssuedEmail;
