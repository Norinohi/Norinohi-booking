/** @jsxImportSource react */
/*
 * BookingCancelledEmail — sent when a booking is cancelled outside the refund path. Usually that
 * means no money was ever taken, and `charged` is what says so: a checkout cancelled while a card
 * payment had already succeeded, or while a transfer was still clearing, ends in the same state,
 * and telling that customer nothing was charged is the one thing this mail must not do.
 *
 * Deliberately carries no money figures either way. Restating a total nobody was charged invites
 * the reply "so where is my refund?", and quoting one we did take promises a figure this mail
 * cannot stand behind — the refund mail states the amount once it has actually moved. Only the
 * card's middle content lives here; the frame comes from EmailLayout and every piece it is drawn
 * with comes from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  Divider,
  Eyebrow,
  Fact,
  FactList,
  Intro,
  Note,
  SupportLink,
  Title,
} from "./_components/ui";

export type BookingCancelledEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale. */
  checkIn: string;
  checkOut: string;
  /**
   * Whether money had landed when the booking was cancelled. A checkout cancelled with a payment
   * already in must not be told nothing was charged, and a refund mail states the amount, so all
   * this line does is stop promising the wrong thing.
   */
  charged: boolean;
  /** What staff or the customer gave as the reason. Absent for a plain self-cancellation. */
  reason?: string;
  searchUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

export function BookingCancelledEmail({
  guestName,
  reference,
  yachtName,
  checkIn,
  checkOut,
  charged,
  reason,
  searchUrl,
  supportUrl,
  appUrl,
}: BookingCancelledEmailProps): React.ReactElement {
  return (
    <EmailLayout preview={`Booking ${reference} is cancelled`} eyebrow="Cancelled" appUrl={appUrl}>
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>Your booking is cancelled</Title>
      <Intro>
        {guestName}, {yachtName} is no longer held for you
        {charged
          ? ". Any money that reached us is being returned, and a separate email follows with the amount once it is on its way."
          : " and nothing has been charged."}{" "}
        Keeping this email means you have the reference if you need to ask us about it later.
      </Intro>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
        {reason ? <Fact label="Reason" value={reason} /> : null}
      </FactList>

      <ActionButton href={searchUrl}>Find another yacht</ActionButton>

      <Divider />
      <Note>If you did not cancel this yourself, tell us and we will look into it.</Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

BookingCancelledEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  charged: false,
  reason: "Changed my plans",
  searchUrl: "https://example.com/en/yachts",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BookingCancelledEmailProps;

export default BookingCancelledEmail;
