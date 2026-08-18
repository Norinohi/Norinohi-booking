import { parseAsString, parseAsStringLiteral } from "nuqs";

export const SUPPORT_TOPICS = ["cancellation"] as const;

/**
 * `/support?booking=<id>` — the booking the visitor came from, if any. Only the id travels:
 * the guest access token stays in localStorage where checkout left it (see ./guest-access),
 * so a shared support link never carries a credential.
 *
 * `topic` only reshapes the page — the heading, the prefilled message, the button. What is
 * sent is the same enquiry either way, so an unknown or forged value costs nothing.
 */
export const supportParsers = {
  booking: parseAsString,
  topic: parseAsStringLiteral(SUPPORT_TOPICS),
};
