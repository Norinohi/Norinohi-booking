import { parseAsString } from "nuqs";

/**
 * `/support?booking=<id>` — the booking the visitor came from, if any. Only the id travels:
 * the guest access token stays in localStorage where checkout left it (see ./guest-access),
 * so a shared support link never carries a credential.
 */
export const supportParsers = {
  booking: parseAsString,
};
