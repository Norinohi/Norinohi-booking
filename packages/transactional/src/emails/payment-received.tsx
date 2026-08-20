/** @jsxImportSource react */
/*
 * PaymentReceivedEmail — the receipt for one payment, sent when the money actually lands rather
 * than when someone pressed Pay. Stripe's own receipt covers a card charge and nothing covered a
 * bank transfer at all, so a customer who paid by invoice heard nothing between sending the money
 * and the charter being confirmed.
 *
 * One payment, not the booking. A deposit charter pays twice and each one gets its own receipt,
 * which is why the amount here is the amount of this charge and the totals below it are the
 * booking's. Only the card's middle content lives here; the frame comes from EmailLayout and
 * every piece it is drawn with comes from ./_components/ui. Keep exactly one jsx-source
 * annotation in this file.
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
  Money,
  Note,
  Panel,
  StatPair,
  SupportLink,
  Title,
} from "./_components/ui";

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
  /**
   * The part of the total the base collects in person, pre-formatted. Absent when the charter
   * has no such line. Named here for the same reason the booking page names it: without it
   * `total` minus `paid` does not reach `outstanding`, and a settled booking reads as
   * underpaid by exactly this much.
   */
  dueAtCheckIn?: string;
  /**
   * Whether the booking owes us nothing further. Its own field rather than something read off
   * `balanceDueAt`, which says when the rest falls due and is absent both when there is no rest
   * and when the provider named no date for one.
   */
  settled: boolean;
  /** When the rest falls due. Absent once nothing is left to pay, and where no date was given. */
  balanceDueAt?: string;
  bookingUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

/**
 * The line under the divider, which is the one place this mail speaks about what is left rather
 * than about the payment it is a receipt for. Keyed on `settled`, because a deposit charter whose
 * provider named no second-payment date has a balance and no date to state, and reading the date
 * as the balance told that customer their charter was paid off.
 */
function closingNote({
  settled,
  balanceDueAt,
  dueAtCheckIn,
}: Pick<PaymentReceivedEmailProps, "settled" | "balanceDueAt" | "dueAtCheckIn">): string {
  if (!settled) {
    return balanceDueAt
      ? `The rest is due by ${balanceDueAt}, and we will remind you before then.`
      : "The rest is still to pay. You can settle it from your booking whenever suits you.";
  }

  // The marina line is part of the total and of nothing we charge, so "nothing left to pay" is
  // true of us and false of the charter until the amount is placed where it is actually paid.
  return dueAtCheckIn
    ? `Nothing else is due to us. The ${dueAtCheckIn} above is settled with the base at check-in.`
    : "Nothing is left to pay on this charter.";
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
  dueAtCheckIn,
  settled,
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
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>We have your payment</Title>
      <Intro>
        {guestName}, your {kind} for {yachtName} arrived. Keep this as your receipt.
      </Intro>

      <Panel>
        <StatPair label="Received" value={amount} second={{ label: "On", value: paidAt }} />
      </Panel>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Paid by" value={method} />
        <Fact label="Reference" value={reference} />
      </FactList>

      <Panel>
        <Money label="Charter total" value={total} />
        <Money label="Paid so far" value={paidTotal} />
        {dueAtCheckIn ? <Money label="Due at the marina" value={dueAtCheckIn} /> : null}
        <Money label="Still to pay" value={outstanding} total />
      </Panel>

      <ActionButton href={bookingUrl}>View your booking</ActionButton>

      <Divider />
      <Note>{closingNote({ settled, balanceDueAt, dueAtCheckIn })}</Note>
      <SupportLink href={supportUrl} />
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
  outstanding: "€2,310",
  dueAtCheckIn: "€125",
  settled: false,
  balanceDueAt: "1 Aug 2026",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies PaymentReceivedEmailProps;

export default PaymentReceivedEmail;
