import {
  createParser,
  createSerializer,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
} from "nuqs/server";

import type { Range } from "@/components/shared/form/filters/lib/state";

const rangeParser = () =>
  createParser({
    parse: (query: string) => {
      const parts = query.split(",");
      if (parts.length !== 2) return null;
      const min = Number(parts[0]);
      const max = Number(parts[1]);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      const range: Range = [min, max];
      return range;
    },
    serialize: (value: Range) => `${value[0]},${value[1]}`,
    eq: (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1],
  });

const multi = () => parseAsArrayOf(parseAsString).withDefault([]);

export const filterParsers = {
  /** Free-text destination search (the location typeahead). */
  query: parseAsString.withDefault(""),
  country: multi(),
  sailingArea: multi(),
  city: multi(),
  charterCompany: multi(),
  marina: multi(),

  startDate: parseAsString,
  duration: parseAsString.withDefault("7"),
  dateFlexibility: parseAsString.withDefault("on-day"),

  boatType: multi(),
  builder: multi(),
  model: multi(),
  crew: multi(),
  mainsailType: multi(),
  equipment: multi(),

  length: rangeParser(),
  cabins: rangeParser(),
  berths: rangeParser(),
  bathrooms: rangeParser(),
  price: rangeParser(),
  yearFrom: parseAsString.withDefault("any"),
  yearTo: parseAsString.withDefault("any"),

  withoutAvailabilityConfirmation: parseAsBoolean.withDefault(false),
  underTemporaryBooking: parseAsBoolean.withDefault(false),
  depositInsurance: parseAsBoolean.withDefault(false),
  petsAllowed: parseAsBoolean.withDefault(false),

  guestRating: rangeParser(),
};

/*
 * Serializes a subset of the filters into a `/yachts` query string. Built on `nuqs/server`, so it
 * runs in Server Components too (unlike the `"nuqs"` client entry, which crashes in RSC) — the
 * footer deep-links into search from server-rendered chrome. Client leaves reach it through the
 * `buildSearchHref` sugar, so both sides emit the same param encoding as `filterParsers` parses.
 */
export const serializeSearch = createSerializer(filterParsers);

/*
 * The charter a visitor already searched for, carried on a listing's own URL so the detail page
 * opens on the dates they picked rather than on an empty calendar. Kept here, next to the search
 * params they come from, because the card that writes them and the sidebar that reads them sit in
 * different features and must agree on the encoding.
 */
/*
 * Where the search map is looking, so a map view survives a reload and can be sent to somebody.
 *
 * Deliberately not part of `filterParsers`: those describe the result set and are serialized into
 * `/yachts` hrefs, while these describe one screen's camera and mean nothing to the list.
 */
export const mapCameraParsers = {
  zoom: parseAsFloat,
  centre: createParser({
    parse: (query: string) => {
      const [lng, lat] = query.split(",").map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { lat, lng };
    },
    /* Five decimals is about a metre, which is finer than a marker is wide and keeps the URL short. */
    serialize: (value: { lat: number; lng: number }) =>
      `${value.lng.toFixed(5)},${value.lat.toFixed(5)}`,
    eq: (a, b) => a.lat === b.lat && a.lng === b.lng,
  }),
};

export const detailPeriodParsers = {
  checkIn: parseAsString,
  checkOut: parseAsString,
};

export const serializeDetailPeriod = createSerializer(detailPeriodParsers);
