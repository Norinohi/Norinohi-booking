import { toSlug } from "../search/catalog-pages";

/*
 * Letters NFKD leaves whole, so `toSlug` would turn them into a hyphen: "Nærøyfjord" came out as
 * `n-r-yfjord`. Spelled out the way they are written in Latin script. Mirrored by the backfill in
 * migration 0131_route_slug; keep the two in step.
 */
const LETTERS = new Map([
  ["æ", "ae"],
  ["ø", "o"],
  ["å", "a"],
  ["ß", "ss"],
  ["đ", "d"],
  ["ł", "l"],
]);

/** A title with no Latin letters left in it (a route written in Ukrainian) still needs an address. */
const FALLBACK = "route";

export function routeSlug(title: string): string {
  const spelled = title
    .toLowerCase()
    .replace(/[æøåßđł]/g, (letter) => LETTERS.get(letter) ?? letter);
  return toSlug(spelled) || FALLBACK;
}

/** `base`, else `base-2`, `base-3`... whichever is not already taken. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
