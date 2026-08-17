const CREW_KEYS = ["bareboat", "skipper", "full-crew"] as const;

/**
 * `crewType` is a provider code until the API finds a `facet_media` translation for it, after
 * which it arrives as a display label. Recognising the code is what tells the two apart.
 */
export function crewKey(value: string | null | undefined): (typeof CREW_KEYS)[number] | null {
  return CREW_KEYS.find((key) => key === value) ?? null;
}

/**
 * Joins sentences while they fit, so a description ends on a full stop rather than mid-word.
 * They arrive in descending order of usefulness, and the first overflow ends it.
 */
export function joinWithinBudget(sentences: string[], budget: number): string {
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > budget) break;
    out = next;
  }

  return out;
}
