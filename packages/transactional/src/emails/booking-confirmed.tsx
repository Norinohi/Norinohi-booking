/** @jsxImportSource react */
/*
 * BookingConfirmedEmail — the charter exists. Sent once the operator has committed the
 * reservation, which is the first moment anything is actually booked, and deliberately separate
 * from BookingReceivedEmail: that one goes out over an unpaid hold, and a customer who gets a
 * single mail called "confirmation" before paying has no way to tell the two apart.
 *
 * The operator's own reference is the point of it. From here on a customer talking to the marina
 * needs their number, not ours, and this is the only place it is sent. Only the card's middle
 * content lives here; the frame and the hero come from EmailLayout and every piece it is drawn
 * with comes from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
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

/**
 * How the opening line ends, which has to agree with the callouts underneath it. "Nothing else is
 * needed from you right now" was printed unconditionally, over a mail that then asked for the
 * balance and for the crew list — the two things this customer most needs to know are still open.
 */
function stillOpen(hasBalance: boolean, hasCrewList: boolean): string {
  if (hasBalance && hasCrewList)
    return "Two things are still open below: the balance and the crew list.";
  if (hasBalance) return "The balance below is the only thing left, and it is not due yet.";
  if (hasCrewList) return "The crew list below is the only thing left to do.";
  return "Nothing else is needed from you right now.";
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
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>{yachtName} is confirmed</Title>
      <Intro>
        {guestName}, the operator has the reservation and the boat is yours for these dates.{" "}
        {stillOpen(Boolean(payUrl), Boolean(crewListUrl))}
      </Intro>

      <Panel>
        <TripDates checkIn={checkIn} checkOut={checkOut} />
      </Panel>

      <FactList>
        <Fact label="Marina" value={marina} />
        <Fact label="Guests" value={String(guests)} />
        {providerReference ? <Fact label="Operator reference" value={providerReference} /> : null}
      </FactList>

      <Panel>
        <Money label="Total price" value={total} />
        <Money label="Paid so far" value={paid} />
        {dueAtCheckIn ? <Money label="Due at the marina" value={dueAtCheckIn} /> : null}
        <Money label="Still to pay" value={outstanding} total />
      </Panel>

      <ActionButton href={bookingUrl}>View your booking</ActionButton>

      {payUrl ? (
        <Callout
          title={balanceDueAt ? `The rest is due by ${balanceDueAt}` : "There is still a balance"}
        >
          <CalloutBody>
            {outstanding} remains on this charter. We will remind you before the date, and you can
            settle it whenever suits you.
          </CalloutBody>
          <CalloutLink href={payUrl}>Pay the balance</CalloutLink>
        </Callout>
      ) : null}

      {crewListUrl ? (
        <Callout title="Who is coming aboard">
          <CalloutBody>
            The marina needs everyone's details before departure. Filling it in early saves the
            queue at check-in.
          </CalloutBody>
          <CalloutLink href={crewListUrl}>Complete the crew list</CalloutLink>
        </Callout>
      ) : null}

      <Divider />
      <Note>
        Keep this mail: the reference above is what identifies your charter to us and to the marina.
      </Note>
      <SupportLink href={supportUrl} />
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
