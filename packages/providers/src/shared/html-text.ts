const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntity(match: string, body: string): string {
  if (body.startsWith("#")) {
    const hex = body.startsWith("#x") || body.startsWith("#X");
    const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10_ff_ff
      ? String.fromCodePoint(code)
      : match;
  }
  return HTML_ENTITIES[body.toLowerCase()] ?? match;
}

/**
 * Yacht text is HTML: `<font color="#89CFF0">`, `<mark>`, inline background
 * styles. It is untrusted vendor markup that we never render, so it is reduced to
 * plain text here, once, for both `listing_text` and the search document that
 * must not index tag soup. Entities are decoded after tags are removed, so an
 * escaped `&lt;script&gt;` cannot be promoted back into one.
 *
 * Shared rather than per-provider: NauSYS and Booking Manager both ship marked-up
 * descriptions, and two copies of an escaping rule is one copy that can be fixed
 * while the other keeps the hole.
 */
export function stripHtml(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const plain = value
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, decodeEntity)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return plain === "" ? undefined : plain;
}
