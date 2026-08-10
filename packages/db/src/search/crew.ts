export type CrewType = "bareboat" | "skipper" | "full-crew";

/**
 * Which crew types the booking sidebar may offer for a listing.
 *
 * Derived from two facts we actually hold rather than from a per-listing list
 * nobody maintains: how the operator sells the yacht (`listing.crew_type`) and
 * which crew roles are attached to it as priced amenities. A yacht sold crewed
 * cannot be taken bareboat, and a bareboat yacht can only be offered a skipper if
 * a skipper is on its price list.
 */
export function crewOptionsFor(
  listingCrewType: string | null,
  crewRoleCodes: readonly string[],
): CrewType[] {
  const has = (code: string) => crewRoleCodes.includes(code);
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
      const options: CrewType[] = ["bareboat"];
      if (has("skipper")) options.push("skipper");
      if (hasFullCrew) options.push("full-crew");
      return options;
    }
  }
}
