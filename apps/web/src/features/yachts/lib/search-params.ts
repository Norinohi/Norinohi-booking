import { createParser, parseAsArrayOf, parseAsBoolean, parseAsString } from "nuqs";

import type { Range } from "@/components/shared/form/filters/lib/state";

const rangeParser = () =>
  createParser({
    parse: (query: string) => {
      const parts = query.split(",");
      if (parts.length !== 2) return null;
      const min = Number(parts[0]);
      const max = Number(parts[1]);
      return Number.isFinite(min) && Number.isFinite(max) ? ([min, max] as Range) : null;
    },
    serialize: (value: Range) => `${value[0]},${value[1]}`,
    eq: (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1],
  });

const multi = () => parseAsArrayOf(parseAsString).withDefault([]);

export const filterParsers = {
  country: multi(),
  sailingArea: multi(),
  charterCompany: multi(),
  marina: multi(),

  startDate: parseAsString,
  duration: parseAsString.withDefault("7"),
  dateFlexibility: parseAsString.withDefault("on-day"),

  boatType: multi(),
  model: multi(),
  crew: multi(),
  mainsailType: multi(),
  equipment: multi(),

  length: rangeParser(),
  cabins: rangeParser(),
  berths: rangeParser(),
  bathrooms: rangeParser(),
  price: rangeParser(),
  boatAge: rangeParser(),
  yearFrom: parseAsString.withDefault("any"),
  yearTo: parseAsString.withDefault("any"),

  withoutAvailabilityConfirmation: parseAsBoolean.withDefault(false),
  underTemporaryBooking: parseAsBoolean.withDefault(false),
  depositInsurance: parseAsBoolean.withDefault(false),
  petsAllowed: parseAsBoolean.withDefault(false),

  guestRating: rangeParser(),
};
