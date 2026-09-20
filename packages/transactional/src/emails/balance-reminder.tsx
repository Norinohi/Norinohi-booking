/** @jsxImportSource react */
/*
 * BalanceReminderEmail — the letters a confirmed booking's second installment earns as its date
 * approaches and then passes. A deposit-policy charter takes the balance weeks or months later,
 * by which time the customer has long left the site; without these the first they hear of the
 * date is the day it passes, and the first thing we do about it is cancel their holiday.
 *
 * Three stages, one template, because they are the same facts told at three distances and a
 * customer who gets all three must recognise the thread. What changes is only the tone and what
 * the closing note promises: `due_soon` is not a warning at all (the booking is confirmed and
 * nothing is wrong yet), `final` states the date is close, and `overdue` says the date has gone
 * and names the consequence plainly. Only the card's middle content lives here; the frame comes
 * from EmailLayout and every piece it is drawn with comes from ./_components/ui. Keep exactly
 * one jsx-source annotation in this file.
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

/** How far the due date is, which is the only thing that differs between the three letters. */
export type BalanceReminderStage = "due_soon" | "final" | "overdue";

export type BalanceReminderEmailProps = {
  guestName: string;
  reference: string;
  yachtName: string;
  /** Pre-formatted by the sender, which holds the locale and the currency. */
  amount: string;
  dueAt: string;
  checkIn: string;
  checkOut: string;
  /** Defaults to the first letter, so an older caller that sends none is unchanged. */
  stage?: BalanceReminderStage;
  payUrl: string;
  supportUrl?: string;
  appUrl?: string;
};

function copyFor(stage: BalanceReminderStage) {
  switch (stage) {
    case "final":
      return {
        title: "Your balance is due in a few days",
        dueLabel: "Due by",
        intro: (guestName: string, yachtName: string) =>
          `${guestName}, the second payment for ${yachtName} is due shortly and we have not received it yet. Paying now keeps everything as it is.`,
        note: "If the balance is not settled by the due date we may have to release the yacht. Tell us first if the date is a problem — we would rather sort it out than cancel a charter.",
      };
    case "overdue":
      return {
        title: "Your balance is overdue",
        dueLabel: "Was due",
        intro: (guestName: string, yachtName: string) =>
          `${guestName}, the second payment for ${yachtName} was due and has not reached us. The charter is still yours for now.`,
        note: "An unpaid balance is grounds for the operator to release the yacht, so please pay or write to us today. If the money is already on its way, or the date is a problem, tell us and we will hold things while we sort it out.",
      };
    default:
      return {
        title: "Your balance is due soon",
        dueLabel: "Due by",
        intro: (guestName: string, yachtName: string) =>
          `${guestName}, ${yachtName} is confirmed and the second payment is coming up. Nothing is wrong — this is the date you agreed at checkout.`,
        note: "If the balance is not settled by the due date we may have to release the yacht. Tell us first if the date is a problem — we would rather sort it out than cancel a charter.",
      };
  }
}

export function BalanceReminderEmail({
  guestName,
  reference,
  yachtName,
  amount,
  dueAt,
  checkIn,
  checkOut,
  stage = "due_soon",
  payUrl,
  supportUrl,
  appUrl,
}: BalanceReminderEmailProps): React.ReactElement {
  const copy = copyFor(stage);

  return (
    <EmailLayout
      preview={`${amount} ${stage === "overdue" ? "overdue" : "due"} ${dueAt} — booking ${reference}`}
      eyebrow="Payment"
      appUrl={appUrl}
    >
      <Eyebrow>Booking {reference}</Eyebrow>
      <Title>{copy.title}</Title>
      <Intro>{copy.intro(guestName, yachtName)}</Intro>

      <Panel>
        <StatPair label="Balance" value={amount} second={{ label: copy.dueLabel, value: dueAt }} />
      </Panel>

      <FactList>
        <Fact label="Yacht" value={yachtName} />
        <Fact label="Charter" value={`${checkIn} → ${checkOut}`} />
      </FactList>

      <ActionButton href={payUrl}>Pay your balance</ActionButton>

      <Divider />
      <Note>{copy.note}</Note>
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
  stage: "due_soon",
  payUrl: "https://example.com/en/bookings/bkg_preview/pay",
  supportUrl: "https://example.com/en/support?booking=bkg_preview",
} satisfies BalanceReminderEmailProps;

export default BalanceReminderEmail;
