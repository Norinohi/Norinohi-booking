/** @jsxImportSource react */
/*
 * HoldExpiringEmail — the last word before an unpaid hold is released.
 *
 * A checkout that stops short of paying leaves the yacht held on the operator's side and running
 * down; the expiry sweep then releases it. That release used to happen in silence, so a customer
 * who meant to finish paying the next morning found the booking gone with nothing sent in
 * between. This is that missing letter: the deadline, the amount, and the link that finishes it.
 *
 * Unlike the balance reminders this is not about a confirmed charter, so it never says the
 * booking is secure — it says the opposite, which is the fact. Only the card's middle content
 * lives here; the frame comes from EmailLayout and every piece it is drawn with comes from
 * ./_components/ui. Keep exactly one jsx-source annotation in this file.
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

export type HoldExpiringEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  outstanding: string;
  /** When the operator's hold lapses, pre-formatted. Always present: it is the point of the mail. */
  holdExpiresAt: string;
  checkIn: string;
  checkOut: string;
  payUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

export function HoldExpiringEmail({
  guestName,
  reference,
  yachtName,
  outstanding,
  holdExpiresAt,
  checkIn,
  checkOut,
  payUrl,
  supportUrl,
  appUrl,
}: HoldExpiringEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`${yachtName} is held until ${holdExpiresAt} — booking ${reference}`}
      eyebrow="Booking"
      appUrl={appUrl}
    >
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>Your yacht is held, but not for long</Title>
      <Intro>
        {guestName}, we are holding {yachtName} for you and the hold runs out shortly. Until the
        payment reaches us the week is not booked, and once the hold lapses the operator can sell it
        to someone else.
      </Intro>

      <Panel>
        <StatPair
          label="To pay"
          value={outstanding}
          second={{ label: "Held until", value: holdExpiresAt }}
        />
      </Panel>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
      </FactList>

      <ActionButton href={payUrl}>Finish your booking</ActionButton>

      <Divider />
      <Note>
        If you need longer, write to us before the hold runs out — an operator will often extend it,
        but only while the hold is still standing.
      </Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

HoldExpiringEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  outstanding: "€2,435",
  holdExpiresAt: "18 Jul 2026",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  payUrl: "https://example.com/en/bookings/bkg_preview/pay",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies HoldExpiringEmailProps;

export default HoldExpiringEmail;
