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
 * Only the card's middle content lives here; the frame and the hero come from EmailLayout and
 * every piece it is drawn with comes from ./_components/ui. Keep exactly one jsx-source
 * annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  ActionLink,
  Callout,
  CalloutBody,
  CalloutLink,
  Divider,
  Eyebrow,
  Fact,
  FactList,
  Intro,
  Money,
  Note,
  Panel,
  SupportLink,
  Title,
  TripDates,
} from "./_components/ui";

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
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>We're holding {yachtName}</Title>
      <Intro>
        {guestName}, the slot is yours to take. It is booked once the payment goes through, and
        everything below is what you agreed at checkout.
        {holdExpiresAt ? ` The operator holds it until ${holdExpiresAt}.` : ""}
      </Intro>

      <Panel>
        <TripDates checkIn={checkIn} checkOut={checkOut} />
      </Panel>

      <FactList>
        <Fact label="Marina" value={marina} />
        <Fact label="Guests" value={String(guests)} />
        {crew ? <Fact label="Crew" value={crew} /> : null}
      </FactList>

      <Panel>
        <Money label="Total price" value={total} />
        <Money label="Paid so far" value={paid} />
        {dueAtCheckIn ? <Money label="Due at the marina" value={dueAtCheckIn} /> : null}
        <Money label="Still to pay" value={outstanding} total />
      </Panel>

      <ActionButton href={payUrl}>Complete your payment</ActionButton>
      <ActionLink href={bookingUrl}>Or view your booking</ActionLink>

      {setPasswordUrl ? (
        <Callout title="Keep this booking in your account">
          <CalloutBody>
            We opened an account with this email address. Set a password and this booking is waiting
            for you on any device.
          </CalloutBody>
          <CalloutLink href={setPasswordUrl}>Set your password</CalloutLink>
        </Callout>
      ) : null}

      <Divider />
      <Note>
        Nothing has been charged yet. Questions about the charter, the dates or the payment? We
        answer within one working day.
      </Note>
      <SupportLink href={supportUrl} />
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
