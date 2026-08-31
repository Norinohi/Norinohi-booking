/*
 * A marina's address in one line, built from parts that overlap.
 *
 * NauSYS sends no name on a base — `RestCharterBase` has no such field — so the catalogue
 * projection names a base after its location, and the location it copies is itself a full path:
 * "Bahamas, Abacos, Boat Harbour Marina", whose head repeats the country. Joining base, location,
 * region and country the obvious way therefore printed the same path three times over on every
 * one of the 295 NauSYS bases. Booking Manager sends real base names and overlaps with nothing,
 * so folding here rather than in the sync leaves that provider's lines exactly as they were.
 *
 * Comparison is per comma-separated segment, accent- and case-folded, so "Šibenik" and "Sibenik"
 * are one place. Order is the caller's: the first spelling of a segment wins and later repeats
 * drop out, which keeps a line reading the way its source parts were meant to.
 */

const fold = (segment: string) =>
  segment
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function placeLine(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const part of parts) {
    for (const raw of (part ?? "").split(",")) {
      const segment = raw.trim();
      const key = fold(segment);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      kept.push(segment);
    }
  }

  return kept.join(", ");
}

/**
 * The parts of `parts` that `against` has not already said, as one line.
 *
 * For the places that keep the marina and its surroundings in separate slots — a sentence, a
 * two-line card — rather than printing one joined address.
 */
export function placeLineExcept(against: string, ...parts: (string | null | undefined)[]): string {
  const full = placeLine(against, ...parts);
  const head = placeLine(against);
  if (!full.startsWith(head)) return full;
  return full.slice(head.length).replace(/^,\s*/, "");
}
