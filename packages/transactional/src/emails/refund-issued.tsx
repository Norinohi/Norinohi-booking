/** @jsxImportSource react */
/*
 * RefundIssuedEmail — sent when money goes back. A cancelled charter is the one moment a
 * customer most wants written confirmation, and until this existed the only trace was a line
 * on their card statement days later.
 *
 * `retained` is present when only part of the money came back — a cancellation policy keeps a
 * share, and saying nothing about the rest reads as a mistake rather than a term they agreed to.
 * It is strictly what the booking keeps: money that arrived by transfer and has not been sent
 * back yet is `awaitingTransfer` instead, because printing it under "Retained" tells a customer
 * we are keeping what we in fact owe them. Only the card's middle content lives here; the frame
 * comes from EmailLayout and every piece it is drawn with comes from ./_components/ui. Keep
 * exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  Callout,
  CalloutBody,
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

/**
 * How the money travelled back, which decides what the customer should watch for. Card money
 * returns through Stripe and lands on a statement; a bank transfer is sent back by hand and
 * reaches the account it came from. A refund can span both when a charter was part-paid each way.
 */
export type RefundMethod = "card" | "transfer" | "mixed";

export type RefundIssuedEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  method: RefundMethod;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  refunded: string;
  /** What the booking keeps for good. Set when the refund was partial, omitted at zero. */
  retained?: string;
  /**
   * Money that arrived by bank transfer and is still to be sent back by hand. Omitted at zero,
   * which is every refund that had nothing but card money left to return.
   */
  awaitingTransfer?: string;
  reason?: string;
  bookingUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

const ARRIVAL = {
  card: "Card refunds usually appear on your statement within five to ten working days, depending on your bank.",
  transfer:
    "It is on its way back to the account the transfer came from, which usually takes a few working days.",
  mixed:
    "The card share appears on your statement within five to ten working days; the rest is on its way back to the account the transfer came from.",
} satisfies Record<RefundMethod, string>;

export function RefundIssuedEmail({
  guestName,
  reference,
  yachtName,
  method,
  refunded,
  retained,
  awaitingTransfer,
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
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>Your refund is on its way</Title>
      <Intro>
        {guestName}, we have returned the money below for {yachtName}. {ARRIVAL[method]}
      </Intro>

      <Panel>
        <StatPair
          label="Refunded"
          value={refunded}
          second={retained ? { label: "Retained", value: retained } : undefined}
        />
      </Panel>

      {awaitingTransfer ? (
        <Callout title="Still to come back">
          <CalloutBody>
            A further {awaitingTransfer} reached us by bank transfer and goes back the same way, by
            hand. We will email you again once it has been sent.
          </CalloutBody>
        </Callout>
      ) : null}

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Booking" value={reference} />
        {reason ? <Fact label="Reason" value={reason} /> : null}
      </FactList>

      <ActionButton href={bookingUrl}>View your booking</ActionButton>

      <Divider />
      <Note>
        If the amount does not look right, or nothing has arrived after ten working days, tell us
        and we will chase it.
      </Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

RefundIssuedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  method: "card",
  refunded: "€2,435",
  retained: "€487",
  reason: "Operator withdrew the yacht",
  bookingUrl: "https://example.com/en/bookings/bkg_preview",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies RefundIssuedEmailProps;

export default RefundIssuedEmail;
