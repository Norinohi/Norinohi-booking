import { normalizedKey } from "./normalize";

/**
 * The headings the yacht page files its equipment under, in the order they are shown.
 *
 * Six, and not the providers' own twenty. NauSYS and Booking Manager each ship their own
 * taxonomy, one of them shouting ("NAVIGATION EQUIPMENT") and both carrying a catch-all bucket
 * that overlaps every other, so grouping on what was synced would put Autopilot under
 * "Navigation" on one boat and "Equipment" on the boat beside it.
 *
 * `other` is last and deliberately vague. What lands there is the tail the vendors file as
 * equipment without it being equipment at all -- a hull colour, a skipper licence requirement --
 * and a heading that promised more than that would read as a mistake.
 */
export const AMENITY_GROUPS = [
  "navigation-and-safety",
  "deck-and-cockpit",
  "interior-and-cabins",
  "galley",
  "entertainment-and-water-toys",
  "systems-and-power",
  "other",
] as const;

export type AmenityGroup = (typeof AMENITY_GROUPS)[number];

const GROUP_ORDER = new Map(AMENITY_GROUPS.map((group, index) => [group, index]));

/**
 * Vendor category to marketplace group, keyed the way `normalizedKey` folds a label.
 *
 * Absent on purpose: "Equipment", "More equipment", "All Equipment", "Additional", "Amenities"
 * and "FACILITIES". Those are the two vendors' catch-alls, and 75,767 of the local catalogue's
 * amenity rows sit in NauSYS's "Equipment" alone, overlapping every specific category it also
 * publishes. Mapping them anywhere would file a chart plotter under whichever row won the fold.
 */
const CATEGORY_GROUPS = {
  navigation: "navigation-and-safety",
  navigationequipment: "navigation-and-safety",
  navigationanddeck: "navigation-and-safety",
  safety: "navigation-and-safety",
  deck: "deck-and-cockpit",
  deckequipment: "deck-and-cockpit",
  deckcockpit: "deck-and-cockpit",
  sails: "deck-and-cockpit",
  interior: "interior-and-cabins",
  comfort: "interior-and-cabins",
  galley: "galley",
  entertainment: "entertainment-and-water-toys",
  yachtelectrics: "systems-and-power",
  yachtelectronics: "systems-and-power",
} satisfies Record<string, AmenityGroup>;

/**
 * The amenities the vendor categories place wrongly, or do not place at all.
 *
 * Two kinds of entry, and both are small on purpose. The first is the handful a charterer would
 * look for under a different heading than the one it was filed in: solar panels are a vendor's
 * deck fitting and a customer's power system. The second is what only ever appears in a
 * catch-all category, so nothing above can resolve it.
 *
 * Keys fold through `normalizedKey`, the same reduction the amenity list and the equipment
 * facet already agree on, so a vendor's own spelling of one of these still matches.
 */
const AMENITY_OVERRIDES = {
  solarpanels: "systems-and-power",
  wifiandinternet: "entertainment-and-water-toys",
  barbecuegrillincockpit: "deck-and-cockpit",
  cockpitcushions: "deck-and-cockpit",
  outsidecushions: "deck-and-cockpit",
  sundeckcushions: "deck-and-cockpit",
  dishwasher: "galley",
  washerdryer: "interior-and-cabins",
  tendergarage: "deck-and-cockpit",
  holdingtank: "systems-and-power",
  greywatertank: "systems-and-power",
  flag: "deck-and-cockpit",
  outsidesteeringposition: "navigation-and-safety",
  rudderblades: "deck-and-cockpit",
  tenderliftplatform: "deck-and-cockpit",
  floatingwalkway: "deck-and-cockpit",
  swimmingpool: "entertainment-and-water-toys",
  gameconsole: "entertainment-and-water-toys",
} satisfies Record<string, AmenityGroup>;

/**
 * Which heading a piece of equipment belongs under.
 *
 * `categories` is every vendor category carrying this amenity on this listing, not just the one
 * whose row survived the fold: a hull sold by both providers publishes the fitting twice, and
 * the page shows one line for it. Where the two disagree across groups the earlier heading
 * wins, so the answer does not depend on which vendor the listing was read from. Six amenities
 * in the current catalogue disagree that way and all six are named above, which leaves the
 * tiebreak as the guard against the seventh rather than as the rule anything relies on.
 */
export function amenityGroupFor(label: string, categories: readonly string[] = []): AmenityGroup {
  const override = lookup(AMENITY_OVERRIDES, label);
  if (override) return override;

  let best: AmenityGroup | undefined;
  for (const category of categories) {
    const group = lookup(CATEGORY_GROUPS, category);
    if (!group) continue;
    if (best === undefined || (GROUP_ORDER.get(group) ?? 0) < (GROUP_ORDER.get(best) ?? 0)) {
      best = group;
    }
  }

  return best ?? "other";
}

/** A table read at its own folded key, which is how both tables above are written. */
function lookup(table: Record<string, AmenityGroup>, label: string): AmenityGroup | undefined {
  return table[normalizedKey(label)];
}

/** Groups in display order, each holding its amenities in the order they were given. */
export function groupAmenities<T extends { group: AmenityGroup }>(
  amenities: readonly T[],
): { group: AmenityGroup; amenities: T[] }[] {
  return AMENITY_GROUPS.map((group) => ({
    group,
    amenities: amenities.filter((amenity) => amenity.group === group),
  })).filter((entry) => entry.amenities.length > 0);
}
