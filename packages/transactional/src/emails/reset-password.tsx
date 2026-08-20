/** @jsxImportSource react */
/*
 * ResetPasswordEmail — the forgot-password email. Only the card's middle content lives here; the
 * letterhead header, footer, and page frame come from EmailLayout, and every piece it is drawn
 * with comes from ./_components/ui. Rendered to HTML by render() in ../index.ts and sent through
 * Resend. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import { ActionButton, Divider, FallbackUrl, Intro, Note, Title } from "./_components/ui";

type ResetPasswordEmailProps = { url: string; appUrl?: string };

export function ResetPasswordEmail({ url, appUrl }: ResetPasswordEmailProps): React.ReactElement {
  return (
    <EmailLayout preview="Reset your YachtSkanner password" eyebrow="Security" appUrl={appUrl}>
      <Title>Reset your password</Title>
      <Intro>
        Someone asked to reset the password for your YachtSkanner account. Choose a new one with the
        button below.
      </Intro>
      <ActionButton href={url}>Reset password</ActionButton>
      <Divider />
      <Note>
        This link works once and expires in 1 hour. If you didn't ask to reset your password, you
        can ignore this email — nothing will change.
      </Note>
      <FallbackUrl url={url} />
    </EmailLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  url: "https://example.com/reset-password?token=preview-token",
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;
