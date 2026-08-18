/** @jsxImportSource react */
/*
 * InvoiceIssuedEmail — sent when a customer chooses to pay by bank transfer. Until this
 * existed the invoice row was written, given a number and a due date, and the customer was
 * told none of it: they left checkout owing money on a deadline nobody had sent them.
 *
 * The bank details are the point of the mail, so they are in the body rather than behind the
 * link — a transfer is typed into a banking app, often on a different device. The reference
 * matters as much as the IBAN: an unreferenced transfer is money we cannot match to a booking.
 * Only the card's middle content lives here; the frame comes from EmailLayout. Keep exactly
 * one jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type InvoiceIssuedEmailProps = {
  guestName: string;
  /** The booking reference, which is also what the transfer must quote. */
  reference: string;
  invoiceNumber: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  amount: string;
  dueAt: string;
  checkIn: string;
  checkOut: string;
  bank: { name: string; iban: string; bic: string };
  payeeName: string;
  invoiceUrl: string;
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
    marginBottom: "8px",
  },
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

  callout: {
    margin: "24px 0 0",
    padding: "18px 20px",
    backgroundColor: "#eef4fe",
    borderRadius: "12px",
  },
  calloutTitle: { margin: "0 0 10px", fontSize: "14px", fontWeight: "700", color: colors.heading },
  calloutBody: { margin: "0 0 10px", fontSize: "13px", lineHeight: "1.6", color: colors.text },

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

export function InvoiceIssuedEmail({
  guestName,
  reference,
  invoiceNumber,
  yachtName,
  amount,
  dueAt,
  checkIn,
  checkOut,
  bank,
  payeeName,
  invoiceUrl,
  supportUrl,
  appUrl,
}: InvoiceIssuedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`Invoice ${invoiceNumber} — ${amount} due ${dueAt}`}
      eyebrow="Invoice"
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Invoice {invoiceNumber}</Text>
      <Heading style={styles.heading}>Your bank transfer details</Heading>
      <Text style={styles.intro}>
        {guestName}, here is what to transfer for {yachtName}. Your booking is held until the due
        date below — the yacht is released if the money has not reached us by then.
      </Text>

      <Section style={styles.amountBox}>
        <Row>
          <Column>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountValue}>{amount}</Text>
          </Column>
          <Column>
            <Text style={styles.amountLabel}>Due by</Text>
            <Text style={styles.dueValue}>{dueAt}</Text>
          </Column>
        </Row>
      </Section>

      <Section style={styles.callout}>
        <Text style={styles.calloutTitle}>Transfer to</Text>
        <Text style={styles.calloutBody}>
          {payeeName}
          <br />
          {bank.name}
          <br />
          IBAN {bank.iban}
          <br />
          BIC {bank.bic}
          <br />
          <strong>Payment reference: {reference}</strong>
        </Text>
        <Text style={styles.calloutBody}>
          Please quote the reference. Without it we cannot match your transfer to this booking, and
          it will not be confirmed.
        </Text>
      </Section>

      <Section>
        <Fact label="Booking" value={reference} />
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={invoiceUrl} style={styles.button}>
          View your invoice
        </Button>
      </Section>

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        Once the transfer arrives we confirm the booking with the operator and email you again. Bank
        transfers usually take one to three working days.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

InvoiceIssuedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  invoiceNumber: "INV-2026-000042",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  amount: "€2,435",
  dueAt: "25 Aug 2026",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  bank: { name: "Zagrebačka banka d.d.", iban: "HR0000000000000000000", bic: "ZABAHR2X" },
  payeeName: "Norinohi Ltd.",
  invoiceUrl: "https://example.com/en/bookings/bkg_preview/invoice",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies InvoiceIssuedEmailProps;

export default InvoiceIssuedEmail;
