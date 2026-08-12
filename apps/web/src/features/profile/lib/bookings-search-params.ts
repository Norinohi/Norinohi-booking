import { parseAsInteger, parseAsString } from "nuqs/server";

/*
 * URL state for /profile/bookings — the date-range filter (plain YYYY-MM-DD, matched against the
 * charter period) and the page. Built on `nuqs/server` so the parsers stay RSC-safe; the screen
 * reads them client-side through `useQueryStates`. `page` defaults to 1 so it drops out of a clean
 * URL, and `from`/`to` clear to null.
 */
export const bookingSearchParsers = {
  from: parseAsString,
  to: parseAsString,
  page: parseAsInteger.withDefault(1),
};
