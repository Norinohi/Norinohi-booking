/** @jsxImportSource react */
/*
 * BookingReceivedEmail — sent the moment a booking is held, which is before any money has moved.
 * It is deliberately not a confirmation: the slot is reserved and the charter is not booked until
 * the payment lands, and the mail that used to go out here said "confirmed" over an unpaid
 * booking. So it carries the yacht's own photo, the reference, the charter, what is owed and the
 * link that finishes the payment, and BookingConfirmedEmail follows once the money is in.
 *
 * `setPasswordUrl` is present only for a guest checkout, whose account was provisioned from their
 * email and has no password yet — a signed-in customer already has one and gets no such block.
 * Only the card's middle content lives here; the frame and the hero come from EmailLayout. Keep
 * exactly one jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type BookingReceivedEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  checkIn: string;
  checkOut: string;
  marina: string;
  guests: number;
  crew?: string;
  total: string;
  paid: string;
  outstanding: string;
  /**
   * The part of the total the base collects in person, pre-formatted. Absent when the charter
   * has no such line. Named here for the same reason the booking page names it: without it
   * `total` minus `paid` does not reach `outstanding`, and a settled booking reads as
   * underpaid by exactly this much.
   */
  dueAtCheckIn?: string;
  bookingUrl: string;
  /** Where the customer finishes paying. The whole point of this mail existing before the money. */
  payUrl: string;
  /**
   * When the operator's hold lapses, pre-formatted. Absent for a provider that grants no
   * option, where there is no deadline to state and inventing one would be a lie.
   */
  holdExpiresAt?: string;
  /** The yacht's own photo. Absent where the provider sent none. */
  imageUrl?: string;
  /** Guest checkouts only — the account exists but has no password yet. */
  setPasswordUrl?: string;
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

  /* The charter itself: two dates facing each other, the way the app's summary shows them. */
  trip: {
    padding: "18px 20px",
    backgroundColor: colors.page,
    borderRadius: "12px",
    marginBottom: "8px",
  },
  tripLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  tripValue: { margin: 0, fontSize: "16px", fontWeight: "700", color: colors.heading },
  tripArrow: { margin: 0, fontSize: "16px", color: colors.muted, textAlign: "center" },

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
  moneyTotal: { fontSize: "20px", fontWeight: "800", color: colors.heading, textAlign: "right" },

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
  callout: {
    margin: "28px 0 0",
    padding: "18px 20px",
    backgroundColor: "#eef4fe",
    borderRadius: "12px",
  },
  calloutTitle: {
    margin: "0 0 6px",
    fontSize: "14px",
    fontWeight: "700",
    color: colors.heading,
  },
  calloutBody: { margin: "0 0 10px", fontSize: "13px", lineHeight: "1.6", color: colors.text },
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

function Money({
  label,
  value,
  total = false,
}: {
  label: string;
  value: string;
  total?: boolean;
}): React.ReactElement {
  return (
    <Row style={styles.moneyRow}>
      <Column>
        <Text style={{ ...styles.moneyRow, ...styles.moneyLabel }}>{label}</Text>
      </Column>
      <Column>
        <Text style={total ? styles.moneyTotal : { ...styles.moneyRow, ...styles.moneyValue }}>
          {value}
        </Text>
      </Column>
    </Row>
  );
}

export function BookingReceivedEmail({
  guestName,
  reference,
  yachtName,
  checkIn,
  checkOut,
  marina,
  guests,
  crew,
  total,
  paid,
  outstanding,
  dueAtCheckIn,
  bookingUrl,
  payUrl,
  holdExpiresAt,
  imageUrl,
  setPasswordUrl,
  supportUrl,
  appUrl,
}: BookingReceivedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`We're holding ${yachtName} — booking ${reference}`}
      eyebrow="Booking"
      hero={imageUrl ? { src: imageUrl, alt: yachtName } : undefined}
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>We're holding {yachtName}</Heading>
      <Text style={styles.intro}>
        {guestName}, the slot is yours to take. It is booked once the payment goes through, and
        everything below is what you agreed at checkout.
        {holdExpiresAt ? ` The operator holds it until ${holdExpiresAt}.` : ""}
      </Text>

      <Section style={styles.trip}>
        <Row>
          <Column>
            <Text style={styles.tripLabel}>Check-in</Text>
            <Text style={styles.tripValue}>{checkIn}</Text>
          </Column>
          <Column style={{ width: "40px" }}>
            <Text style={styles.tripArrow}>→</Text>
          </Column>
          <Column>
            <Text style={styles.tripLabel}>Check-out</Text>
            <Text style={styles.tripValue}>{checkOut}</Text>
          </Column>
        </Row>
      </Section>

      <Section>
        <Fact label="Marina" value={marina} />
        <Fact label="Guests" value={String(guests)} />
        {crew ? <Fact label="Crew" value={crew} /> : null}
      </Section>

      <Section style={styles.moneyBox}>
        <Money label="Total price" value={total} total />
        <Money label="Paid so far" value={paid} />
        {dueAtCheckIn ? <Money label="Due at the marina" value={dueAtCheckIn} /> : null}
        <Money label="Still to pay" value={outstanding} />
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={payUrl} style={styles.button}>
          Complete your payment
        </Button>
      </Section>

      <Section style={{ ...styles.buttonRow, margin: "14px 0 0" }}>
        <Link href={bookingUrl} style={styles.link}>
          Or view your booking →
        </Link>
      </Section>

      {setPasswordUrl ? (
        <Section style={styles.callout}>
          <Text style={styles.calloutTitle}>Keep this booking in your account</Text>
          <Text style={styles.calloutBody}>
            We opened an account with this email address. Set a password and this booking is waiting
            for you on any device.
          </Text>
          <Link href={setPasswordUrl} style={styles.link}>
            Set your password →
          </Link>
        </Section>
      ) : null}

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        Nothing has been charged yet. Questions about the charter, the dates or the payment? We
        answer within one working day.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

BookingReceivedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  marina: "ACI Marina Cres, Croatia",
  guests: 2,
  crew: "Bareboat",
  total: "€4,870",
  paid: "€0",
  outstanding: "€4,745",
  dueAtCheckIn: "€125",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  payUrl: "https://example.com/en/bookings/bkg_preview/pay",
  holdExpiresAt: "17 Aug 2026",
  imageUrl: "https://images.unsplash.com/photo-1500514966906-fe245eea9344?w=1024",
  setPasswordUrl: "https://example.com/en/forgot-password?email=john%40example.com",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BookingReceivedEmailProps;

export default BookingReceivedEmail;
