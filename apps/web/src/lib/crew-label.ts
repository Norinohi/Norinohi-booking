import type { useTranslations } from "next-intl";

const CREW_KEYS = ["bareboat", "skipper", "full-crew"] as const;

export type CrewTranslator = ReturnType<typeof useTranslations<"Common.crewTypes">>;

/**
 * `crewType` is a provider code until the API finds a `facet_media` translation for it, after
 * which it arrives as a display label. Recognising the code is what tells the two apart.
 */
export function crewKey(value: string | null | undefined): (typeof CREW_KEYS)[number] | null {
  return CREW_KEYS.find((key) => key === value) ?? null;
}

/** A known code in the visitor's language; anything else is already backend copy and passes through. */
export function crewLabel(t: CrewTranslator, value: string): string {
  const key = crewKey(value);
  return key ? t(key) : value;
}
