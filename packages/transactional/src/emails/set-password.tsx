/** @jsxImportSource react */
/*
 * SetPasswordEmail — the first-password email. Same single-use link as ResetPasswordEmail, but
 * addressed to someone who has never had a password: guest checkout provisioned their account,
 * so "reset" would describe something they never did. Only the card's middle content lives here;
 * the letterhead header, footer, and page frame come from EmailLayout. Keep exactly one
 * jsx-source annotation in this file.
 */
import { Button, Heading, Hr, Link, Text } from "@react-email/components";
import * as React from "react";

import { colors, EmailLayout, fontFamily } from "./_components/email-layout";

export type SetPasswordEmailProps = { url: string; name?: string; appUrl?: string };

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

export function SetPasswordEmail({ url, name, appUrl }: SetPasswordEmailProps): React.ReactElement {
  return (
    <EmailLayout preview="Set your YachtSkanner password" eyebrow="Your account" appUrl={appUrl}>
      <Heading style={styles.heading}>Set your password</Heading>
      <Text style={styles.intro}>
        {name ? `${name}, your` : "Your"} YachtSkanner account is ready. Choose a password with the
        button below and you can sign in to see your bookings, saved yachts and enquiries any time.
      </Text>
      <Button href={url} style={styles.button}>
        Set password
      </Button>
      <Text style={styles.note}>
        This link works once and expires in 1 hour. If it has expired, ask for a new one from the
        sign-in page.
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

SetPasswordEmail.PreviewProps = {
  url: "https://example.com/en/reset-password?welcome=1&token=preview-token",
  name: "Daria",
} satisfies SetPasswordEmailProps;

export default SetPasswordEmail;
