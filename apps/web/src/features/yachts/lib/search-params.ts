import {
  createParser,
  createSerializer,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
} from "nuqs/server";

import type { Range } from "@/components/shared/form/filters/lib/state";

/*
 * These parsers are the boundary: everything past them is trusted as filter state and handed to
 * `toSearchInput`, which does arithmetic on it and sends it to a contract with its own bounds.
 * A parser that returns null falls back to the parameter's default, so a hand-edited or stale URL
 * loses the one filter it got wrong instead of failing the whole search. Without that, a `Number()`
 * over unchecked text reached the contract as `NaN` and answered 400 for the page.
 *
 * Shape only. A range is not measured against the facet limits here, because those arrive with the
 * facets and a parser runs before them -- the sliders clamp to the limits once they land.
 */
const rangeParser = ({ integer = false, min = 0, max = Number.POSITIVE_INFINITY } = {}) =>
  createParser({
    parse: (query: string) => {
      const parts = query.split(",");
      if (parts.length !== 2) return null;
      const first = Number(parts[0]);
      const second = Number(parts[1]);
      const valid = (value: number) =>
        Number.isFinite(value) &&
        value >= min &&
        value <= max &&
        (!integer || Number.isInteger(value));
      if (!valid(first) || !valid(second)) return null;
      /* A crossed pair is a hand-edited URL; order it rather than searching an empty band. */
      const range: Range = first <= second ? [first, second] : [second, first];
      return range;
    },
    serialize: (value: Range) => `${value[0]},${value[1]}`,
    eq: (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1],
  });

/** One of a fixed set of values, so an unknown one falls back to the parameter's default. */
const oneOf = (values: readonly string[]) =>
  createParser({
    parse: (query: string) => (values.includes(query) ? query : null),
    serialize: (value: string) => value,
  });

const MAX_CHARTER_NIGHTS = 365;

/** "any", or a whole number of nights `toSearchInput` sends on as `duration`. */
const durationParser = createParser({
  parse: (query: string) => {
    if (query === "any") return query;
    const nights = Number(query);
    if (!Number.isInteger(nights) || nights < 1 || nights > MAX_CHARTER_NIGHTS) return null;
    return query;
  },
  serialize: (value: string) => value,
});

/** "any", or a four-digit year `toSearchInput` turns into a number. */
const yearParser = createParser({
  parse: (query: string) => (query === "any" || /^\d{4}$/.test(query) ? query : null),
  serialize: (value: string) => value,
});

/** A real calendar day. The contract takes the same shape and rejects anything else. */
const dayParser = createParser({
  parse: (query: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(query) && !Number.isNaN(new Date(`${query}T00:00:00.000Z`).getTime())
      ? query
      : null,
  serialize: (value: string) => value,
});

const DATE_FLEXIBILITY_VALUES = ["on-day", "1-3-days", "1-week", "2-weeks", "1-month"] as const;

const multi = () => parseAsArrayOf(parseAsString).withDefault([]);

export const filterParsers = {
  /** Free-text destination search (the location typeahead). */
  query: parseAsString.withDefault(""),
  country: multi(),
  sailingArea: multi(),
  city: multi(),
  charterCompany: multi(),
  marina: multi(),

  startDate: dayParser,
  duration: durationParser.withDefault("any"),
  dateFlexibility: oneOf(DATE_FLEXIBILITY_VALUES).withDefault("on-day"),

  boatType: multi(),
  builder: multi(),
  model: multi(),
  crew: multi(),
  mainsailType: multi(),
  equipment: multi(),

  /* Feet, and fractional: `toSearchInput` converts to metres for a `nonnegative()` bound. */
  length: rangeParser(),
  cabins: rangeParser({ integer: true }),
  berths: rangeParser({ integer: true }),
  bathrooms: rangeParser({ integer: true }),
  /* Whole currency units; `toSearchInput` multiplies by 100 for an `int()` bound in minor. */
  price: rangeParser({ integer: true }),
  yearFrom: yearParser.withDefault("any"),
  yearTo: yearParser.withDefault("any"),

  withoutAvailabilityConfirmation: parseAsBoolean.withDefault(false),
  underTemporaryBooking: parseAsBoolean.withDefault(false),
  depositInsurance: parseAsBoolean.withDefault(false),
  petsAllowed: parseAsBoolean.withDefault(false),

  guestRating: rangeParser({ max: 5 }),
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

export const serializeMapCamera = createSerializer(mapCameraParsers);

export const detailPeriodParsers = {
  checkIn: parseAsString,
  checkOut: parseAsString,
};

export const serializeDetailPeriod = createSerializer(detailPeriodParsers);
