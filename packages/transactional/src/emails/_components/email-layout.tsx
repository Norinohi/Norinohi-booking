/** @jsxImportSource react */
/*
 * EmailLayout — the shared shell every transactional email renders inside. One card, laid out
 * like a piece of branded stationery: a letterhead row (wordmark left, a tracked eyebrow right),
 * the template's content, and a black footer matching the app's site footer (bg natural-900).
 * Templates pass their content as children and their own `eyebrow`. The
 * pragma on line 1 is load-bearing — consumers (apps/server) compile with the hono JSX runtime
 * and pull this file in as source, so it must pin the React runtime per file. Keep exactly one
 * jsx-source annotation in this file.
 *
 * `colors` and `fontFamily` are exported so templates share one palette instead of drifting.
 */
import {
  Body,
  Column,
  Container,
  Font,
  Head,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const colors = {
  page: "#f4f5f7",
  card: "#ffffff",
  border: "#e6e7ea",
  heading: "#0a0a0a",
  text: "#383838",
  muted: "#787878",
  brand: "#2f80ed",
  footerBg: "#0a0a0a", // natural-900 — matches the app's site footer
  footerText: "#e2e2e2", // natural-100
  footerMuted: "#787878", // natural-400
} as const;

// Manrope is the app's typeface; declare it first and let clients that lack it fall back.
export const fontFamily = "Manrope, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// The public site the footer links back to. Real sends pass the deployed web origin; the
// preview server and any caller that omits it fall back to this.
const DEFAULT_APP_URL = "https://yachtskanner.com";

const styles = {
  body: { margin: 0, backgroundColor: colors.page, fontFamily, color: colors.text },
  container: { maxWidth: "512px", margin: "0 auto", padding: "40px 20px" },
  card: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "14px",
    overflow: "hidden",
  },
  header: { padding: "28px 36px 24px", borderBottom: `1px solid ${colors.border}` },
  wordmark: {
    fontFamily,
    fontSize: "20px",
    fontWeight: "800",
    color: colors.heading,
    textDecoration: "none",
    letterSpacing: "-0.02em",
  },
  eyebrow: {
    margin: 0,
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: colors.muted,
    textAlign: "right",
  },
  content: { padding: "36px" },
  footer: { backgroundColor: colors.footerBg, padding: "32px 36px" },
  footerWordmark: { margin: "0 0 6px", fontSize: "15px", fontWeight: "800", color: "#ffffff" },
  footerTagline: {
    margin: "0 0 18px",
    fontSize: "13px",
    lineHeight: "1.5",
    color: colors.footerText,
  },
  footerLinks: { margin: "0 0 18px", fontSize: "13px" },
  footerLink: { color: "#ffffff", textDecoration: "none", fontWeight: "600" },
  footerDot: { color: colors.footerMuted, padding: "0 8px" },
  footerLegal: {
    margin: 0,
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.footerMuted,
  },
} as const;

export function EmailLayout({
  preview,
  eyebrow,
  children,
  appUrl = DEFAULT_APP_URL,
}: {
  preview: string;
  eyebrow: string;
  children: ReactNode;
  appUrl?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Manrope"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.header}>
              <Row>
                <Column>
                  <Link href={appUrl} style={styles.wordmark}>
                    YachtSkanner
                  </Link>
                </Column>
                <Column>
                  <Text style={styles.eyebrow}>{eyebrow}</Text>
                </Column>
              </Row>
            </Section>

            <Section style={styles.content}>{children}</Section>

            <Section style={styles.footer}>
              <Text style={styles.footerWordmark}>YachtSkanner</Text>
              <Text style={styles.footerTagline}>
                Chartered yachts across the Mediterranean and beyond.
              </Text>
              <Text style={styles.footerLinks}>
                <Link href={appUrl} style={styles.footerLink}>
                  Home
                </Link>
                <span style={styles.footerDot}>·</span>
                <Link href={`${appUrl}/privacy`} style={styles.footerLink}>
                  Privacy
                </Link>
                <span style={styles.footerDot}>·</span>
                <Link href={`${appUrl}/terms`} style={styles.footerLink}>
                  Terms
                </Link>
              </Text>
              <Text style={styles.footerLegal}>© {year} YachtSkanner</Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
