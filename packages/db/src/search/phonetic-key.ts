import { sql, type SQL } from "drizzle-orm";

import { normalizedKey, normalizedKeySql } from "./normalize";

/*
 * A place name reduced to roughly how it sounds, so "Шибеник" typed on the Ukrainian site finds
 * Šibenik. Cities and marinas carry no translations, and a strict transliteration does not help:
 * Ukrainian writes "Шибеник" as `shybenyk`, which shares no substring with `sibenik`. Both sides
 * are pushed onto one coarse spelling instead, where `sh`, `š` and `ш` are all `s`, and `y`, `j`
 * and `и` are all `i`. Only the typeahead uses it: it is loose enough to suggest, not to filter.
 */
const CYRILLIC = new Map(
  Object.entries({
    а: "a",
    б: "b",
    в: "v",
    г: "h",
    ґ: "g",
    д: "d",
    е: "e",
    є: "e",
    ж: "z",
    з: "z",
    и: "i",
    і: "i",
    ї: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "c",
    ш: "s",
    щ: "s",
    ь: "",
    ю: "iu",
    я: "ia",
    ы: "i",
    э: "e",
    ъ: "",
    ё: "e",
  }),
);

/* Applied in order, digraphs before the single letters they contain. */
const LATIN_FOLDS: readonly (readonly [from: string, to: string])[] = [
  ["sch", "s"],
  ["sh", "s"],
  ["ch", "c"],
  ["zh", "z"],
  ["kh", "h"],
  ["tz", "c"],
  ["ts", "c"],
  ["ph", "f"],
  ["th", "t"],
  /* Greek names: Gouvia is "Гувія". */
  ["ou", "u"],
  ["x", "ks"],
  ["q", "k"],
  ["w", "v"],
  ["y", "i"],
  ["j", "i"],
  /* Ukrainian has no `g` in "Гданськ" or "Гувія"; the vendors spell either letter. */
  ["g", "h"],
];

export function hasCyrillic(value: string): boolean {
  return /[Ѐ-ӿ]/.test(value);
}

export function phoneticKey(value: string): string {
  const latin = [...value.toLowerCase()].map((char) => CYRILLIC.get(char) ?? char).join("");
  let key = normalizedKey(latin);
  for (const [from, to] of LATIN_FOLDS) key = key.replaceAll(from, to);
  return key.replace(/(.)\1+/g, "$1");
}

export function phoneticKeySql(column: SQL): SQL {
  let expression = normalizedKeySql(column);
  for (const [from, to] of LATIN_FOLDS) {
    expression = sql`replace(${expression}, ${from}, ${to})`;
  }
  return sql`regexp_replace(${expression}, '(.)\\1+', '\\1', 'g')`;
}
