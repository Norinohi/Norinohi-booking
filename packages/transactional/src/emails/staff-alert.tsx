/** @jsxImportSource react */
/*
 * StaffAlertEmail — the internal ping when something lands that a person has to act on: a new
 * enquiry, or a new question on a booking. Deliberately plain and dense — it goes to a
 * colleague's inbox next to fifty others, so the subject and the first two lines have to say
 * what it is and how urgent, and the link does the rest. Every piece it is drawn with comes
 * from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import { ActionButton, Fact, FactList, Quote, Title } from "./_components/ui";

export type StaffAlertEmailProps = {
  title: string;
  /** Label/value pairs — who it is from, which booking, which yacht. */
  facts: { label: string; value: string }[];
  /** The customer's own words, when there are any. */
  body?: string;
  actionUrl: string;
  actionLabel: string;
  appUrl?: string;
};

export function StaffAlertEmail({
  title,
  facts,
  body,
  actionUrl,
  actionLabel,
  appUrl,
}: StaffAlertEmailProps): React.ReactElement {
  return (
    <EmailLayout preview={title} eyebrow="Internal" appUrl={appUrl}>
      <Title>{title}</Title>

      <FactList>
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </FactList>

      {body ? <Quote label="Message">{body}</Quote> : null}

      <ActionButton href={actionUrl}>{actionLabel}</ActionButton>
    </EmailLayout>
  );
}

StaffAlertEmail.PreviewProps = {
  title: "New question on booking NB-T93Q9JFL",
  facts: [
    { label: "From", value: "John Doe (john@example.com)" },
    { label: "Yacht", value: "Lagoon 50 — 6 + 2 cab." },
    { label: "Charter", value: "15 Aug 2026 → 22 Aug 2026" },
  ],
  body: "Do you need to see a sailing licence before departure?",
  actionUrl: "https://example.com/en/inbox",
  actionLabel: "Open the inbox",
} satisfies StaffAlertEmailProps;

export default StaffAlertEmail;
