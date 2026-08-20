/** @jsxImportSource react */
/*
 * BalanceReminderEmail — the nudge before a confirmed booking's second installment falls due.
 * A deposit-policy charter takes the balance weeks or months later, by which time the customer
 * has long left the site; without this the first they hear of the date is the day it passes.
 *
 * Deliberately not a warning. The booking is confirmed and nothing is wrong yet, so the tone is
 * a reminder with a pay link, and the consequence is stated once rather than repeated. Only the
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
  Panel,
  StatPair,
  SupportLink,
  Title,
} from "./_components/ui";

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
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>Your balance is due soon</Title>
      <Intro>
        {guestName}, {yachtName} is confirmed and the second payment is coming up. Nothing is wrong
        — this is the date you agreed at checkout.
      </Intro>

      <Panel>
        <StatPair label="Balance" value={amount} second={{ label: "Due by", value: dueAt }} />
      </Panel>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
      </FactList>

      <ActionButton href={payUrl}>Pay your balance</ActionButton>

      <Divider />
      <Note>
        If the balance is not settled by the due date we may have to release the yacht. Tell us
        first if the date is a problem — we would rather sort it out than cancel a charter.
      </Note>
      <SupportLink href={supportUrl} />
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
