export type CrewType = "bareboat" | "skipper" | "full-crew";

/**
 * Which crew types the booking sidebar may offer for a listing.
 *
 * Derived from three facts we actually hold rather than from a per-listing list
 * nobody maintains: how the operator sells the yacht (`listing.crew_type`), which
 * crew roles are attached to it as priced amenities, and which of those the
 * operator marks obligatory. A yacht sold crewed cannot be taken bareboat, and a
 * bareboat yacht can only be offered a skipper if a skipper is on its price list.
 */
export function crewOptionsFor(
  listingCrewType: string | null,
  crewRoleCodes: readonly string[],
  obligatoryCrewRoles: readonly string[] = [],
): CrewType[] {
  const has = (code: string) => crewRoleCodes.includes(code);
  /*
   * An operator that files the skipper as an obligatory extra will bill it whatever the
   * customer picks, and the offer we quote from carries it as a mandatory line. The listing
   * still called itself bareboat, so the sidebar offered Bareboat and then charged 1,505 EUR
   * for a skipper under Mandatory extras - the choice was never real. Believing the charge
   * over the label is the direction that cannot under-quote: dropping the line to match the
   * label would have us sell a charter for less than the vendor bills us.
   */
  const skipperIsObligatory = obligatoryCrewRoles.includes("skipper");
  // Two roles beyond the skipper is what makes a full crew sellable; a skipper
  // and nothing else is still a skippered charter.
  const hasFullCrew = has("skipper") && (has("hostess") || has("cook"));

  switch (listingCrewType) {
    case "full-crew":
      return ["full-crew"];

    // Sold with a skipper aboard, so bareboat is not on offer at any price.
    case "skipper":
      return hasFullCrew ? ["skipper", "full-crew"] : ["skipper"];

    // Bareboat, or an operator that never said — either way the hull sails
    // without crew and anything above that has to be bought.
    default: {
      if (skipperIsObligatory) return hasFullCrew ? ["skipper", "full-crew"] : ["skipper"];

      const options: CrewType[] = ["bareboat"];
      if (has("skipper")) options.push("skipper");
      if (hasFullCrew) options.push("full-crew");
      return options;
    }
  }
}
