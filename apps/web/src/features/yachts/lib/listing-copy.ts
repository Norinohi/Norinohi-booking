/* Lives in lib so the card mappers can share it; re-exported here for the detail route's SEO copy. */
export { crewKey } from "@/lib/crew-label";

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
