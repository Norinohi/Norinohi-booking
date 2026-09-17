const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 65;

/** The emoji flag for an ISO 3166-1 alpha-2 code, or an empty string for anything else. */
export function countryFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(
    ...[...upper].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A),
  );
}
