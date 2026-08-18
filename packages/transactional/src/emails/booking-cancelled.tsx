/** @jsxImportSource react */
/*
 * BookingCancelledEmail — sent when a booking is cancelled and no money is coming back,
 * because none was ever taken. The refund mail covers the other case and says its own amount;
 * this one exists for the silence that used to follow a cancellation before payment.
 *
 * Deliberately carries no money figures. Restating a total nobody was charged invites the
 * reply "so where is my refund?", which is the opposite of what this is for. Only the card's
 * middle content lives here; the frame comes from EmailLayout. Keep exactly one jsx-source
 * annotation in this file.
 */
import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type BookingCancelledEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale. */
  checkIn: string;
  checkOut: string;
  /** What staff or the customer gave as the reason. Absent for a plain self-cancellation. */
  reason?: string;
  searchUrl: string;
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

export function BookingCancelledEmail({
  guestName,
  reference,
  yachtName,
  checkIn,
  checkOut,
  reason,
  searchUrl,
  supportUrl,
  appUrl,
}: BookingCancelledEmailProps): React.ReactElement {
  return (
    <EmailLayout preview={`Booking ${reference} is cancelled`} eyebrow="Cancelled" appUrl={appUrl}>
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>Your booking is cancelled</Heading>
      <Text style={styles.intro}>
        {guestName}, {yachtName} is no longer held for you and nothing has been charged. Keeping
        this email means you have the reference if you need to ask us about it later.
      </Text>

      <Section>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
        {reason ? <Fact label="Reason" value={reason} /> : null}
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={searchUrl} style={styles.button}>
          Find another yacht
        </Button>
      </Section>

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        If you did not cancel this yourself, tell us and we will look into it.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

BookingCancelledEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  reason: "Changed my plans",
  searchUrl: "https://example.com/en/yachts",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BookingCancelledEmailProps;

export default BookingCancelledEmail;
