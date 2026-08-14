/** @jsxImportSource react */
/*
 * ResetPasswordEmail — the forgot-password email. Only the card's middle content lives here; the
 * letterhead header, footer, and page frame come from EmailLayout. Rendered to HTML by render()
 * in ../index.ts and sent through Resend. Keep exactly one jsx-source annotation in this file.
 */
import { Button, Heading, Hr, Link, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

type ResetPasswordEmailProps = { url: string; appUrl?: string };

const styles = {
  heading: {
    margin: "0 0 14px",
    fontFamily,
    fontSize: "24px",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  intro: { margin: "0 0 28px", fontSize: "15px", lineHeight: "1.6", color: colors.text },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    fontWeight: "600",
    padding: "14px 28px",
    borderRadius: "8px",
    textDecoration: "none",
  },
  note: { margin: "28px 0 0", fontSize: "13px", lineHeight: "1.6", color: colors.muted },
  divider: { margin: "28px 0 20px", border: "none", borderTop: `1px solid ${colors.border}` },
  fallbackLabel: { margin: "0 0 8px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  fallbackUrl: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "1.5",
    color: colors.brand,
    wordBreak: "break-all",
  },
} as const;

export function ResetPasswordEmail({ url, appUrl }: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Reset your YachtSkanner password" eyebrow="Security" appUrl={appUrl}>
      <Heading style={styles.heading}>Reset your password</Heading>
      <Text style={styles.intro}>
        Someone asked to reset the password for your YachtSkanner account. Choose a new one with the
        button below.
      </Text>
      <Button href={url} style={styles.button}>
        Reset password
      </Button>
      <Text style={styles.note}>
        This link works once and expires in 1 hour. If you didn't ask to reset your password, you
        can ignore this email — nothing will change.
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fallbackLabel}>
        Button not working? Paste this link into your browser:
      </Text>
      <Link href={url} style={styles.fallbackUrl}>
        {url}
      </Link>
    </EmailLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  url: "https://example.com/reset-password?token=preview-token",
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;
