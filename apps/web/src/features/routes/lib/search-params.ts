import { createSerializer, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { ROUTE_LENGTHS, ROUTE_LEVELS } from "./route-filters";

/*
 * The filters, in the query string so a link to a filtered list opens on exactly that. Which
 * route is open is not among them: it is the path, `/routes/<slug>`, the address that gets indexed. A value the parsers do not recognise falls back to empty rather than failing the
 * page, the same rule the search map's parsers follow.
 */
export const routesMapParsers = {
  q: parseAsString.withDefault(""),
  country: parseAsString,
  length: parseAsStringLiteral(ROUTE_LENGTHS),
  level: parseAsStringLiteral(ROUTE_LEVELS),
};

/** A path with the filters that are set appended, for moving between routes without losing them. */
export const serializeRoutesMap = createSerializer(routesMapParsers);
