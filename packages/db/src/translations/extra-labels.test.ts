import { describe, expect, it } from "vitest";

import { extraLabels } from "./extra-labels";
import { ukTranslations } from "./uk";

/** Mirrors extraNameKeySql in search/repository.ts and extraNameKey in apply-translations.ts. */
function nameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

describe("extraLabels", () => {
  it("names every locale the site serves for every entry", () => {
    for (const [name, byLocale] of Object.entries(extraLabels)) {
      expect(Object.keys(byLocale).sort(), name).toEqual(["de", "es", "uk"]);
    }
  });

  it("never gives one folded key two different labels", () => {
    /* The read join folds case and punctuation, so "Wi-Fi" and "WiFi" are one row. Two spellings
       that disagree would reach Postgres as an ON CONFLICT that hits the same row twice, which
       fails the whole batch and names neither entry. */
    const byKey = new Map<string, { name: string; label: string }>();

    for (const [name, byLocale] of Object.entries(extraLabels)) {
      for (const [locale, label] of Object.entries(byLocale)) {
        const key = `${nameKey(name)}:${locale}`;
        const seen = byKey.get(key);
        expect(seen?.label ?? label, `${name} vs ${seen?.name} in ${locale}`).toBe(label);
        byKey.set(key, { name, label });
      }
    }
  });

  it("holds no blank or untrimmed label", () => {
    /* A blank one would read as a fee with no name, which is worse on the page than the
       vendor's English; a padded one would not match anything the fold produces. */
    for (const [name, byLocale] of Object.entries(extraLabels)) {
      for (const label of Object.values(byLocale)) {
        expect(label.trim(), name).toBe(label);
        expect(label.length, name).toBeGreaterThan(0);
      }
    }
  });

  it("carries an actual translation wherever the word differs between languages", () => {
    /* "Wi-Fi" and "Seabob" are the same word everywhere, so identity is allowed - but the two
       non-English locales agreeing with English AND each other on a multi-word name means the
       entry was never filled in. */
    for (const [name, byLocale] of Object.entries(extraLabels)) {
      if (!name.includes(" ")) continue;
      expect([byLocale.de, byLocale.es, byLocale.uk], name).not.toEqual([name, name, name]);
    }
  });
});

describe("ukTranslations", () => {
  it("keys facets on values the catalogue can hold", () => {
    for (const labels of Object.values(ukTranslations.facets)) {
      for (const value of Object.keys(labels)) {
        expect(value.trim(), value).toBe(value);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("keys extras on the provider's own id space", () => {
    for (const labels of Object.values(ukTranslations.extras)) {
      for (const key of Object.keys(labels)) {
        expect(key, key).toMatch(/^(service|equipment):\d+$/);
      }
    }
  });
});
