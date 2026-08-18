/** @jsxImportSource react */
/*
 * BookingConfirmedEmail — the charter exists. Sent once the operator has committed the
 * reservation, which is the first moment anything is actually booked, and deliberately separate
 * from BookingReceivedEmail: that one goes out over an unpaid hold, and a customer who gets a
 * single mail called "confirmation" before paying has no way to tell the two apart.
 *
 * The operator's own reference is the point of it. From here on a customer talking to the marina
 * needs their number, not ours, and this is the only place it is sent. Only the card's middle
 * content lives here; the frame and the hero come from EmailLayout. Keep exactly one jsx-source
 * annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type BookingConfirmedEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  checkIn: string;
  checkOut: string;
  marina: string;
  guests: number;
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
  /** When the rest falls due. Absent on a booking that is already paid in full. */
  balanceDueAt?: string;
  /** The operator's own reservation number. Absent where the provider issued none. */
  providerReference?: string;
  /** The operator's crew-list form, where one came back with the reservation. */
  crewListUrl?: string;
  bookingUrl: string;
  /** Only where something is still owed, so a settled booking is not asked for money. */
  payUrl?: string;
  imageUrl?: string;
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
  calloutTitle: { margin: "0 0 6px", fontSize: "14px", fontWeight: "700", color: colors.heading },
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

export function BookingConfirmedEmail({
  guestName,
  reference,
  yachtName,
  checkIn,
  checkOut,
  marina,
  guests,
  total,
  paid,
  outstanding,
  dueAtCheckIn,
  balanceDueAt,
  providerReference,
  crewListUrl,
  bookingUrl,
  payUrl,
  imageUrl,
  supportUrl,
  appUrl,
}: BookingConfirmedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`${yachtName} is confirmed — booking ${reference}`}
      eyebrow="Confirmed"
      hero={imageUrl ? { src: imageUrl, alt: yachtName } : undefined}
      appUrl={appUrl}
    >
      <Text style={styles.eyebrow}>Booking {reference}</Text>
      <Heading style={styles.heading}>{yachtName} is confirmed</Heading>
      <Text style={styles.intro}>
        {guestName}, the operator has the reservation and the boat is yours for these dates. Nothing
        else is needed from you right now.
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
        {providerReference ? <Fact label="Operator reference" value={providerReference} /> : null}
      </Section>

      <Section style={styles.moneyBox}>
        <Money label="Total price" value={total} total />
        <Money label="Paid so far" value={paid} />
        {dueAtCheckIn ? <Money label="Due at the marina" value={dueAtCheckIn} /> : null}
        <Money label="Still to pay" value={outstanding} />
      </Section>

      <Section style={styles.buttonRow}>
        <Button href={bookingUrl} style={styles.button}>
          View your booking
        </Button>
      </Section>

      {payUrl ? (
        <Section style={styles.callout}>
          <Text style={styles.calloutTitle}>
            {balanceDueAt ? `The rest is due by ${balanceDueAt}` : "There is still a balance"}
          </Text>
          <Text style={styles.calloutBody}>
            {outstanding} remains on this charter. We will remind you before the date, and you can
            settle it whenever suits you.
          </Text>
          <Link href={payUrl} style={styles.link}>
            Pay the balance →
          </Link>
        </Section>
      ) : null}

      {crewListUrl ? (
        <Section style={styles.callout}>
          <Text style={styles.calloutTitle}>Who is coming aboard</Text>
          <Text style={styles.calloutBody}>
            The marina needs everyone's details before departure. Filling it in early saves the
            queue at check-in.
          </Text>
          <Link href={crewListUrl} style={styles.link}>
            Complete the crew list →
          </Link>
        </Section>
      ) : null}

      <Hr style={styles.divider} />
      <Text style={styles.note}>
        Keep this mail: the reference above is what identifies your charter to us and to the marina.
      </Text>
      {supportUrl ? (
        <Link href={supportUrl} style={styles.link}>
          Contact support →
        </Link>
      ) : null}
    </EmailLayout>
  );
}

BookingConfirmedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  marina: "ACI Marina Cres, Croatia",
  guests: 2,
  total: "€4,870",
  paid: "€2,435",
  outstanding: "€2,310",
  dueAtCheckIn: "€125",
  balanceDueAt: "1 Aug 2026",
  providerReference: "NS-4471902",
  crewListUrl: "https://example.com/crew/bkg_preview",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  payUrl: "https://example.com/en/bookings/bkg_preview/pay",
  imageUrl: "https://images.unsplash.com/photo-1500514966906-fe245eea9344?w=1024",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BookingConfirmedEmailProps;

export default BookingConfirmedEmail;
