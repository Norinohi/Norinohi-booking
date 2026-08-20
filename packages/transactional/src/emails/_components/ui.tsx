/** @jsxImportSource react */
/*
 * The shared vocabulary every template is built from. Before this file each of the twelve
 * templates carried its own copy of the same style block, and the copies had drifted: headings
 * ran 22, 24 and 26px, buttons 600 and 700 weight at three different paddings, dividers at two
 * margins. A customer who gets a booking mail and then a payment mail sees both, and the
 * mismatch is what made the set read as unfinished.
 *
 * The alignment rules here are the other half. `Row` renders one table per row, so columns left
 * to size themselves land the label/value split in a different place on every line — which is
 * why every column below carries an explicit percentage width. Padding sits on the cells, never
 * on the `Row`, because that style reaches a `<tr>` and Outlook drops it there.
 *
 * The pragma on line 1 is load-bearing for the same reason it is in email-layout: apps/server
 * compiles with the hono JSX runtime and pulls this file in as source. Keep exactly one
 * jsx-source annotation in this file.
 */
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import * as React from "react";

import { colors, fontFamily } from "./email-layout";

/* One scale, one weight ramp, one radius. Templates compose these; they do not restate them. */
const styles = {
  eyebrow: {
    margin: "0 0 8px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: colors.brand,
  },
  title: {
    margin: "0 0 12px",
    fontFamily,
    fontSize: "26px",
    lineHeight: "1.2",
    fontWeight: "800",
    letterSpacing: "-0.02em",
    color: colors.heading,
  },
  intro: { margin: "0 0 24px", fontSize: "15px", lineHeight: "1.6", color: colors.text },

  panel: {
    margin: "0 0 20px",
    padding: "18px 20px",
    backgroundColor: colors.panel,
    borderRadius: "12px",
  },
  panelLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  statValue: {
    margin: 0,
    fontSize: "26px",
    lineHeight: "1.15",
    fontWeight: "800",
    color: colors.heading,
  },
  statValueSm: {
    margin: 0,
    fontSize: "16px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
  },
  /* Two halves of one panel. The 4% gutter keeps the second label off the first value. */
  statCellLeft: { width: "48%", verticalAlign: "top" },
  statCellRight: { width: "48%", verticalAlign: "top" },
  statGutter: { width: "4%" },

  /* Dates read as a journey: the two ends anchor to the panel's own edges and the arrow sits
     dead centre between them. Left to align both columns left, a short date leaves a gap on one
     side of the arrow and none on the other, and the block reads as though it slipped. */
  tripCell: { width: "46%", verticalAlign: "bottom" },
  tripCellEnd: { width: "46%", verticalAlign: "bottom", textAlign: "right" },
  tripArrowCell: { width: "8%", verticalAlign: "bottom" },
  tripLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  tripLabelEnd: {
    margin: "0 0 4px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
    textAlign: "right",
  },
  tripValue: {
    margin: 0,
    fontSize: "16px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
  },
  tripValueEnd: {
    margin: 0,
    fontSize: "16px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
    textAlign: "right",
  },
  tripArrow: {
    margin: 0,
    fontSize: "16px",
    lineHeight: "1.4",
    color: colors.muted,
    textAlign: "center",
  },

  factList: { margin: "0 0 20px" },
  factLabelCell: {
    width: "42%",
    padding: "12px 12px 12px 0",
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: "top",
  },
  factValueCell: {
    width: "58%",
    padding: "12px 0",
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: "top",
    textAlign: "right",
  },
  factLabel: { margin: 0, fontSize: "14px", lineHeight: "1.5", color: colors.muted },
  factValue: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.5",
    fontWeight: "700",
    color: colors.heading,
  },

  moneyLabelCell: { width: "58%", padding: "5px 12px 5px 0", verticalAlign: "middle" },
  moneyValueCell: { width: "42%", padding: "5px 0", verticalAlign: "middle", textAlign: "right" },
  moneyLabel: { margin: 0, fontSize: "14px", lineHeight: "1.5", color: colors.muted },
  moneyValue: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.5",
    fontWeight: "700",
    color: colors.heading,
  },
  /* The number the mail is actually about, ruled off from the lines that build up to it. */
  moneyTotalLabelCell: {
    width: "58%",
    padding: "13px 12px 0 0",
    borderTop: `1px solid ${colors.border}`,
    verticalAlign: "middle",
  },
  moneyTotalValueCell: {
    width: "42%",
    padding: "13px 0 0",
    borderTop: `1px solid ${colors.border}`,
    verticalAlign: "middle",
    textAlign: "right",
  },
  moneyTotalLabel: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
  },
  moneyTotalValue: {
    margin: 0,
    fontSize: "20px",
    lineHeight: "1.4",
    fontWeight: "800",
    color: colors.heading,
  },

  /* Left-aligned, like everything else in the card. A centred button under left-aligned facts
     is the one element that breaks the grid, and it was centred in half the templates only. */
  actionRow: { margin: "8px 0 0" },
  button: {
    display: "inline-block",
    backgroundColor: colors.brand,
    color: "#ffffff",
    fontFamily,
    fontSize: "15px",
    lineHeight: "1.2",
    fontWeight: "700",
    padding: "15px 30px",
    borderRadius: "8px",
    textDecoration: "none",
  },
  actionLinkRow: { margin: "14px 0 0" },
  link: {
    fontSize: "13px",
    lineHeight: "1.6",
    fontWeight: "700",
    color: colors.brand,
    textDecoration: "none",
  },

  callout: {
    margin: "24px 0 0",
    padding: "18px 20px",
    backgroundColor: colors.accentPanel,
    borderLeft: `3px solid ${colors.brand}`,
    borderRadius: "10px",
  },
  calloutTitle: {
    margin: "0 0 6px",
    fontSize: "14px",
    lineHeight: "1.4",
    fontWeight: "700",
    color: colors.heading,
  },
  calloutBody: { margin: "0 0 10px", fontSize: "13px", lineHeight: "1.6", color: colors.text },

  quoteLabel: {
    margin: "0 0 8px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  quote: {
    margin: "0 0 24px",
    padding: "16px 18px",
    backgroundColor: colors.panel,
    borderRadius: "10px",
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.text,
    whiteSpace: "pre-wrap",
  },

  divider: { margin: "32px 0 20px", border: "none", borderTop: `1px solid ${colors.border}` },
  fallbackLabel: { margin: "16px 0 6px", fontSize: "12px", lineHeight: "1.5", color: colors.muted },
  fallbackUrl: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "1.5",
    color: colors.brand,
    wordBreak: "break-all",
  },
  note: { margin: "0 0 10px", fontSize: "13px", lineHeight: "1.6", color: colors.muted },
} as const;

export function Eyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Heading style={styles.title}>{children}</Heading>;
}

export function Intro({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.intro}>{children}</Text>;
}

/** The grey panel a stat pair or a money summary sits in. */
export function Panel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Section style={styles.panel}>{children}</Section>;
}

/**
 * The headline figure and its companion, side by side: an amount and the date it landed, a
 * balance and the date it falls due. `second` is optional because a full refund has nothing to
 * put beside it, and a lone half-width column would read as a missing value.
 */
export function StatPair({
  label,
  value,
  second,
}: {
  label: string;
  value: string;
  second?: { label: string; value: string };
}): React.ReactElement {
  return (
    <Row>
      <Column style={styles.statCellLeft}>
        <Text style={styles.panelLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </Column>
      {second ? (
        <>
          <Column style={styles.statGutter}>&nbsp;</Column>
          <Column style={styles.statCellRight}>
            <Text style={styles.panelLabel}>{second.label}</Text>
            <Text style={styles.statValueSm}>{second.value}</Text>
          </Column>
        </>
      ) : null}
    </Row>
  );
}

export function TripDates({
  checkIn,
  checkOut,
}: {
  checkIn: string;
  checkOut: string;
}): React.ReactElement {
  return (
    <Row>
      <Column style={styles.tripCell}>
        <Text style={styles.tripLabel}>Check-in</Text>
        <Text style={styles.tripValue}>{checkIn}</Text>
      </Column>
      <Column style={styles.tripArrowCell}>
        <Text style={styles.tripArrow}>&rarr;</Text>
      </Column>
      <Column style={styles.tripCellEnd}>
        <Text style={styles.tripLabelEnd}>Check-out</Text>
        <Text style={styles.tripValueEnd}>{checkOut}</Text>
      </Column>
    </Row>
  );
}

/** Wraps a run of `Fact` rows so the block owns its spacing, like every other block. */
export function FactList({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Section style={styles.factList}>{children}</Section>;
}

export function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Row>
      <Column style={styles.factLabelCell}>
        <Text style={styles.factLabel}>{label}</Text>
      </Column>
      <Column style={styles.factValueCell}>
        <Text style={styles.factValue}>{value}</Text>
      </Column>
    </Row>
  );
}

/**
 * One line of a money summary. `total` marks the line the reader is meant to land on — what is
 * still to pay, or the charter total where nothing is owed — and rules it off from the lines
 * above it.
 */
export function Money({
  label,
  value,
  total = false,
}: {
  label: string;
  value: string;
  total?: boolean;
}): React.ReactElement {
  return (
    <Row>
      <Column style={total ? styles.moneyTotalLabelCell : styles.moneyLabelCell}>
        <Text style={total ? styles.moneyTotalLabel : styles.moneyLabel}>{label}</Text>
      </Column>
      <Column style={total ? styles.moneyTotalValueCell : styles.moneyValueCell}>
        <Text style={total ? styles.moneyTotalValue : styles.moneyValue}>{value}</Text>
      </Column>
    </Row>
  );
}

export function ActionButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Section style={styles.actionRow}>
      <Button href={href} style={styles.button}>
        {children}
      </Button>
    </Section>
  );
}

/** The quieter second route out of a mail, under the button that is the first one. */
export function ActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Section style={styles.actionLinkRow}>
      <Link href={href} style={styles.link}>
        {children} &rarr;
      </Link>
    </Section>
  );
}

export function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Section style={styles.callout}>
      <Text style={styles.calloutTitle}>{title}</Text>
      {children}
    </Section>
  );
}

export function CalloutBody({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.calloutBody}>{children}</Text>;
}

export function CalloutLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Link href={href} style={styles.link}>
      {children} &rarr;
    </Link>
  );
}

/** Someone's own words, echoed back: the question asked, the message sent. */
export function Quote({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={styles.quote}>{children}</Text>
    </>
  );
}

/** Names a block of facts where the rows alone would not say what they are a list of. */
export function GroupLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.quoteLabel}>{children}</Text>;
}

export function Divider(): React.ReactElement {
  return <Hr style={styles.divider} />;
}

export function Note({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={styles.note}>{children}</Text>;
}

/**
 * The pasteable copy of a link, for the clients that strip the button. Only the two
 * password mails carry one: they are the mails where a dead button means a locked-out account.
 */
export function FallbackUrl({ url }: { url: string }): React.ReactElement {
  return (
    <>
      <Text style={styles.fallbackLabel}>
        Button not working? Paste this link into your browser:
      </Text>
      <Link href={url} style={styles.fallbackUrl}>
        {url}
      </Link>
    </>
  );
}

/** The footer link every customer-facing mail ends on, absent where no support URL was given. */
export function SupportLink({ href }: { href?: string }): React.ReactElement | null {
  if (!href) return null;
  return (
    <Link href={href} style={styles.link}>
      Contact support &rarr;
    </Link>
  );
}
