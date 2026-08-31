/*
 * Re-exported so the web app can format a marina line the same way the read model does without
 * naming `@yacht-charter/db`. The implementation is a zero-dependency leaf; it lives beside the
 * read model because that is where the overlapping parts are assembled.
 */
export { placeLine, placeLineExcept } from "@yacht-charter/db/search/place-line";
