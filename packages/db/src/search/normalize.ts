import { sql, type SQL } from "drizzle-orm";

/*
 * Letters two vendors spell differently for the same place, folded to the one both agree on.
 *
 * NauSYS sends Croatian, Turkish and Nordic names accented; Booking Manager sends the same bases
 * transliterated. Stripping non-alphanumerics does not reconcile them, because an accented letter
 * is not alphanumeric and simply vanished -- "Sukošan / D-Marin Dalmacija Marina" folded to
 * `sukoandmarin...` while "Sukosan, D-Marin Dalmacija Marina" folded to `sukosandmarin...`, and
 * the marina facet offered one marina twice with its fleet split down the middle.
 *
 * The pair is a single constant, and the SQL form below is built from it, because the two halves
 * of every facet join fold in different languages. `unaccent` was the obvious alternative and is
 * the wrong one: it folds `ø` and the Turkish dotless `ı`, which the JavaScript half would have
 * to reproduce by hand anyway, and both letters are in this catalogue.
 *
 * A letter missing from this map is not a silent mismatch -- it is stripped on both sides, which
 * is exactly what happened to every accent before this existed.
 */
const FOLD_FROM =
  "áàâäãåāăąȧćčçĉċďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľłñńņňòóôöõøōŏőŕŗřśšşŝșťţțŭùúûüũūůűųŵŷÿýźžż";
const FOLD_TO =
  "aaaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijkllllnnnnooooooooorrrssssstttuuuuuuuuuuwyyyzzz";

const MULTI_CHAR_FOLDS: readonly (readonly [from: string, to: string])[] = [
  ["&", "and"],
  ["ß", "ss"],
  ["æ", "ae"],
  ["œ", "oe"],
];

/**
 * A place or facet label reduced to the letters and digits every spelling of it agrees on.
 *
 * The single fold for the whole read model: facet grouping, filter matching, the `facet_media`
 * join and the curated-rank writer all reduce their side with this or with `normalizedKeySql`.
 * They have to agree exactly -- a writer folding one way and a read join folding the other
 * produces rows the join can never reach. That is why `&` becomes "and" before anything is
 * stripped: the facet once offered "Wi-Fi & Internet" as `wi-fi-and-internet`, the filter
 * reduced that to `wifiandinternet`, the column reduced itself to `wifiinternet`, and forty
 * options across the catalogue answered with nothing.
 */
export function normalizedKey(value: string): string {
  let folded = value.trim().toLowerCase();
  for (const [from, to] of MULTI_CHAR_FOLDS) folded = folded.replaceAll(from, to);

  return folded
    .replace(/[^a-z0-9]/g, (char) => FOLD_TO[FOLD_FROM.indexOf(char)] ?? char)
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * `normalizedKey` as SQL, for the reads that fold a column they never loaded.
 *
 * Built from the same constants rather than written out, so the pair cannot drift.
 */
export function normalizedKeySql(column: SQL): SQL {
  let expression = sql`lower(coalesce(${column}, ''))`;
  for (const [from, to] of MULTI_CHAR_FOLDS) {
    expression = sql`replace(${expression}, ${from}, ${to})`;
  }

  return sql`regexp_replace(translate(${expression}, ${FOLD_FROM}, ${FOLD_TO}), '[^a-z0-9]+', '', 'g')`;
}
