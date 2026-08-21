import type { useTranslations } from "next-intl";

/** The presenter's badge codes to this namespace's message keys. */
const BADGE_KEY = new Map<string, "bestValue" | "petsAllowed" | "depositInsurance" | "topRated">([
  ["best-value", "bestValue"],
  ["pets-allowed", "petsAllowed"],
  ["deposit-insurance", "depositInsurance"],
  ["top-rated", "topRated"],
]);

export type BadgeTranslator = ReturnType<typeof useTranslations<"Common.boatCard.badges">>;

/**
 * A promotional badge in the visitor's language.
 *
 * Badges are composed in `packages/api`'s presenter, which has no locale, so each arrives as a
 * code plus the English it was written in. An unrecognised code keeps that English rather than
 * vanishing: a badge nobody has translated yet is still true.
 */
export function badgeLabel(t: BadgeTranslator, badge: { code?: string; label: string }): string {
  const key = badge.code === undefined ? undefined : BADGE_KEY.get(badge.code);
  return key ? t(key) : badge.label;
}
