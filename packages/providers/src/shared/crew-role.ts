/**
 * Which crew role a service's name says it is, if any.
 *
 * Neither vendor marks an extra as crew: a skipper is a priced service like a paddleboard,
 * and the only signal is what the operator called it. So this reads the name, and
 * an unrecognised one stays unset rather than being guessed into a role - quoting
 * a customer for a skipper they did not ask for is worse than not offering crew.
 *
 * Ordered because "skippered cook" must not match `skipper` first; the most
 * specific patterns are tried before the general ones. Reviewed against the
 * services our own account returns, so it will need revisiting for an operator who
 * names crew in a language this does not cover.
 */
const CREW_ROLE_PATTERNS: { role: "skipper" | "hostess" | "cook"; pattern: RegExp }[] = [
  { role: "cook", pattern: /\b(cook|chef)\b/i },
  { role: "hostess", pattern: /\b(hostess|host|stewardess)\b/i },
  { role: "skipper", pattern: /\b(skipper|captain)\b/i },
];

/**
 * Names that mention a crew word but are not that person's fee for the charter.
 *
 * Operators sell a lot beside the skipper: "Skipper training practice" (235 rows), "Checkout
 * Skipper" (175) and "Day Checkout Captain" (169) are the handover, "ASA Skipper" and
 * "Certification Skipper" (90 each) are sailing courses, "Captain By Day"/"By Night" (89 each)
 * are hourly hire, and "Additional fee for Skipper in forepeak & shared bathroom" (72) is a
 * cabin surcharge. Reading any of them as the skipper adds a week of crew to a card the vendor
 * never charges for -- one hull advertised 15,050 EUR against a quote of 12,550, the difference
 * being a training course counted as the skipper.
 *
 * Deliberately a list of markers rather than a shape: these are names people typed, and the
 * only honest rule is that a word like "training" or "surcharge" says what the line really is.
 */
const NOT_CREW_MARKERS =
  /\b(training|course|lesson|school|certification|asa|licen[cs]e|surcharge|checkout|check-out|forepeak|by day|by night|short[- ]term|additional fee)\b/i;

export function crewRoleOf(name: string): "skipper" | "hostess" | "cook" | undefined {
  if (NOT_CREW_MARKERS.test(name)) return undefined;
  return CREW_ROLE_PATTERNS.find((entry) => entry.pattern.test(name))?.role;
}
