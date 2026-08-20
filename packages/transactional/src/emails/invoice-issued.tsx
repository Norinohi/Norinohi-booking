/** @jsxImportSource react */
/*
 * InvoiceIssuedEmail — sent when a customer chooses to pay by bank transfer. Until this
 * existed the invoice row was written, given a number and a due date, and the customer was
 * told none of it: they left checkout owing money on a deadline nobody had sent them.
 *
 * The bank details are the point of the mail, so they are in the body rather than behind the
 * link — a transfer is typed into a banking app, often on a different device. The reference
 * matters as much as the IBAN: an unreferenced transfer is money we cannot match to a booking,
 * so it gets its own row rather than a line inside a paragraph.
 *
 * `holdExpiresAt` is the honest half of the deadline. The due date is our payment terms, capped
 * at the departure; the operator's option is a separate clock we do not control, and it is
 * routinely the shorter of the two. Saying "held until the due date" over an option that lapses
 * days earlier promises a boat nobody is holding, so where the option runs out first the mail
 * names that date instead. Only the card's middle content
 * lives here; the frame comes from EmailLayout and every piece it is drawn with comes from
 * ./_components/ui. Keep exactly one jsx-source annotation in this file.
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
  GroupLabel,
  Intro,
  Note,
  Panel,
  StatPair,
  SupportLink,
  Title,
} from "./_components/ui";

export type InvoiceIssuedEmailProps = {
  guestName: string;
  /** The booking reference, which is also what the transfer must quote. */
  reference: string;
  invoiceNumber: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  amount: string;
  dueAt: string;
  /**
   * When the operator's option lapses, pre-formatted. Set only where it falls before `dueAt`,
   * which is the sender's call: an option that outlives the invoice constrains nothing and
   * naming a second date would be noise.
   */
  holdExpiresAt?: string;
  checkIn: string;
  checkOut: string;
  bank: { name: string; iban: string; bic: string };
  payeeName: string;
  invoiceUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

export function InvoiceIssuedEmail({
  guestName,
  reference,
  invoiceNumber,
  yachtName,
  amount,
  dueAt,
  holdExpiresAt,
  checkIn,
  checkOut,
  bank,
  payeeName,
  invoiceUrl,
  supportUrl,
  appUrl,
}: InvoiceIssuedEmailProps): React.ReactElement {
  return (
    <EmailLayout
      preview={`Invoice ${invoiceNumber} — ${amount} due ${dueAt}`}
      eyebrow="Invoice"
      appUrl={appUrl}
    >
      <Eyebrow>Invoice {invoiceNumber}</Eyebrow>
      <Title>Your bank transfer details</Title>
      <Intro>
        {guestName}, here is what to transfer for {yachtName}.{" "}
        {holdExpiresAt
          ? `The operator holds the yacht until ${holdExpiresAt}, which is sooner than the due date below, so send the transfer as early as you can. If the money arrives after the hold has gone and the slot with it, we return it in full.`
          : "Your booking is held until the due date below, and the yacht is released if the money has not reached us by then."}
      </Intro>

      <Panel>
        <StatPair label="Amount" value={amount} second={{ label: "Due by", value: dueAt }} />
      </Panel>

      {/* The rows a transfer is typed from, in the order a banking form asks for them. */}
      <GroupLabel>Transfer to</GroupLabel>
      <FactList>
        <Fact label="Payee" value={payeeName} />
        <Fact label="Bank" value={bank.name} />
        <Fact label="IBAN" value={bank.iban} />
        <Fact label="BIC" value={bank.bic} />
        <Fact label="Payment reference" value={reference} />
      </FactList>

      <GroupLabel>What this invoice covers</GroupLabel>
      <FactList>
        <Fact label="Booking" value={reference} />
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
        {holdExpiresAt ? <Fact label="Yacht held until" value={holdExpiresAt} /> : null}
      </FactList>

      <Callout title="Quote the reference">
        <CalloutBody>
          Without <strong>{reference}</strong> on the transfer we cannot match your money to this
          booking, and it will not be confirmed.
        </CalloutBody>
      </Callout>

      <ActionButton href={invoiceUrl}>View your invoice</ActionButton>

      <Divider />
      <Note>
        Once the transfer arrives we confirm the booking with the operator and email you again. Bank
        transfers usually take one to three working days.
      </Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

InvoiceIssuedEmail.PreviewProps = {
  guestName: "John",
  reference: "NB-T93Q9JFL",
  invoiceNumber: "INV-2026-000042",
  yachtName: "Lagoon 50 — 6 + 2 cab.",
  amount: "€2,435",
  dueAt: "25 Aug 2026",
  holdExpiresAt: "21 Aug 2026",
  checkIn: "15 Aug 2026",
  checkOut: "22 Aug 2026",
  bank: { name: "Zagrebačka banka d.d.", iban: "HR0000000000000000000", bic: "ZABAHR2X" },
  payeeName: "Norinohi Ltd.",
  invoiceUrl: "https://example.com/en/bookings/bkg_preview/invoice",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies InvoiceIssuedEmailProps;

export default InvoiceIssuedEmail;
