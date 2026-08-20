/** @jsxImportSource react */
/*
 * SetPasswordEmail — the first-password email. Same single-use link as ResetPasswordEmail, but
 * addressed to someone who has never had a password: guest checkout provisioned their account,
 * so "reset" would describe something they never did. Only the card's middle content lives here;
 * the letterhead header, footer, and page frame come from EmailLayout, and every piece it is
 * drawn with comes from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import { ActionButton, Divider, FallbackUrl, Intro, Note, Title } from "./_components/ui";

export type SetPasswordEmailProps = { url: string; name?: string; appUrl?: string };

export function SetPasswordEmail({ url, name, appUrl }: SetPasswordEmailProps): React.ReactElement {
  return (
    <EmailLayout preview="Set your YachtSkanner password" eyebrow="Your account" appUrl={appUrl}>
      <Title>Set your password</Title>
      <Intro>
        {name ? `${name}, your` : "Your"} YachtSkanner account is ready. Choose a password with the
        button below and you can sign in to see your bookings, saved yachts and enquiries any time.
      </Intro>
      <ActionButton href={url}>Set password</ActionButton>
      <Divider />
      <Note>
        This link works once and expires in 1 hour. If it has expired, ask for a new one from the
        sign-in page.
      </Note>
      <FallbackUrl url={url} />
    </EmailLayout>
  );
}

SetPasswordEmail.PreviewProps = {
  url: "https://example.com/en/reset-password?welcome=1&token=preview-token",
  name: "Daria",
} satisfies SetPasswordEmailProps;

export default SetPasswordEmail;
