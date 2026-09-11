/*
 * Vendor amenity rows collapsed onto the amenity the marketplace filters by.
 *
 * The two providers keep separate amenity taxonomies, and about thirty entries name the same
 * fitting in different words: NauSYS sells "Bimini top" where Booking Manager sells "Bimini",
 * "GPS chart plotter" against "Chart plotter", "Bathing platform" against "Swimming platform".
 * The facet fold reconciles spelling, not wording, so each pair became two filter options with
 * the fleet split between them. Grouping happens here rather than by renaming the vendor rows,
 * so `amenity.name` keeps saying what the vendor published and the yacht page can still show it.
 *
 * Keyed by `amenity.code` (`<provider>:<vendor id>`), for the reason the category map gives:
 * vendor display names are localized and get re-worded between syncs while the ids do not.
 *
 * The canonical side is always a spelling the catalogue already carries, and in practice the
 * Booking Manager one, because the shortlist the equipment filter offers is written in that
 * vocabulary (see `equipmentFilterAllowlist` in packages/db/src/seed.ts). An entry that named
 * something no listing carries would be a filter option with no boats behind it.
 *
 * What is deliberately absent is as much of the point as what is here. Rows that name a
 * neighbouring thing are left alone even where folding them would fill out a filter: a plain
 * "Gangway" is not a hydraulic one, a "Radar reflector" is not radar, an "Ice box" is not an ice
 * maker, and a "Washing machine" is not a washer/dryer. Those boats answer no option rather than
 * the wrong one.
 */
const AMENITY_GROUPS = new Map([
  ["nausys:4", "Air condition"], // Air Conditioning

  ["nausys:15", "Bimini"], // Bimini top
  ["nausys:100622", "Bimini"], // Hard Top Bimini

  ["nausys:5", "Chart plotter"], // GPS chart plotter
  ["nausys:107379", "Chart plotter in cockpit"], // GPS chart plotter - cockpit

  /* Machines only. "Coffee pot" and "Moka pot" are stovetop pots and stay where they are. */
  ["nausys:100497", "Coffee maker"], // Coffee machine
  ["nausys:604498", "Coffee maker"], // NESPRESSO coffee machine
  ["nausys:7760310", "Coffee maker"], // Electrical filter coffee maker
  ["nausys:7260815", "Coffee maker"], // Nescaffe Dolce Gusto Coffee Maker

  /* The Booking Manager entry means a table that drops to make a berth, which is what lowering
     a salon table is for. A table that merely folds is not the same thing. */
  ["nausys:10295341", "Convertible table"], // Convertible table in salon
  ["nausys:1033031", "Convertible table"], // Lowerable salon table

  ["nausys:100492", "Dinghy"], // Dinghy with outboard engine
  ["nausys:4899880", "Dinghy"], // Tender
  ["nausys:485617", "Tender garage"], // Dinghy garage

  /* Every electric winch aboard is an electric winch. The two windlasses are not: an anchor
     windlass is its own fitting and the filter does not offer it. */
  ["nausys:101704", "Electric winches"], // Electric winch
  ["nausys:113469", "Electric winches"], // Electric halyard winch
  ["nausys:4263031", "Electric winches"], // Electric main sail winch
  ["nausys:485619", "Electric winches"], // Electric genoa winch
  ["nausys:1081584", "Electric winches"], // Electric primary winch

  ["nausys:477212", "Gennaker"], // Gennaker-device
  ["nausys:479365", "Spinnaker"], // Spinnaker-device
  ["nausys:105903", "Lazy jack"], // Lazy jacks

  /*
   * Radio and CD in the same row, which is what the Booking Manager entry names. A bare
   * "Radio", "CD player" or "Bluetooth player" is half of it and is left out; "VHF radio" is
   * the safety set and is a different thing entirely.
   */
  ["nausys:101720", "Radio-CD player"], // Radio CD mp3 player
  ["nausys:107451", "Radio-CD player"], // Radio CD mp3 player + USB
  ["nausys:473999", "Radio-CD player"], // Radio CD player, USB, AUX input
  ["nausys:474048", "Radio-CD player"], // Radio CD/mp3 player, USB, AUX input
  ["nausys:476459", "Radio-CD player"], // Radio CD mp3 player + USB, Bluetooth
  ["nausys:4473983", "Radio-CD player"], // Radio CD player, USB, Bluetooth
  ["nausys:474002", "Radio-CD player"], // Radio CD/MP3 player, AUX input
  ["nausys:479887", "Radio-CD player"], // Radio CD player + USB

  /* A television, whatever it is made of. The two "+ DVD" rows carry a DVD player as well and
     could as fairly point at that option; they point here because far more people filter on a
     television than on a disc player, and a row can only become one thing. */
  ["nausys:100476", "TV"], // LCD TV
  ["nausys:8975489", "TV"], // LED TV
  ["nausys:9", "TV"], // SAT TV
  ["nausys:580703", "TV"], // TV + DVD
  ["nausys:578318", "TV"], // LCD TV + DVD

  ["nausys:100485", "Railing net"], // Railing net (Safety net)
  ["nausys:1327571", "Snorkeling equipment"], // Mask and snorkel

  ["nausys:578504", "Stand up paddle"], // Stand up paddle (SUP)
  ["nausys:6871064", "Stand up paddle"], // Stand up paddle (SUP) - FREE
  ["nausys:554780", "Stand up paddle"], // Paddle board

  ["nausys:100626", "Swimming platform"], // Bathing platform
  ["nausys:100483", "Swimming platform"], // Hydraulic lifting swimming platform

  ["nausys:4363441", "Barbecue grill in cockpit"], // Cockpit grill
  ["nausys:100500", "Barbecue grill in cockpit"], // Grill/Barbecue/Plancha

  ["nausys:1509132", "Cockpit cushions"], // Cockpit seat cushions with backrest
  ["nausys:37438254", "Cockpit cushions"], // Forward cockpit cushions

  ["nausys:16", "Water maker"], // Watermaker - desalinator

  ["nausys:477829", "Wi-Fi & Internet"], // Wi-Fi Internet
  ["nausys:7097267", "Wi-Fi & Internet"], // Wireless Internet Router
]);

/** The marketplace-facing amenity for a vendor amenity code, or null when it is its own thing. */
export function canonicalAmenityName(code: string): string | null {
  return AMENITY_GROUPS.get(code) ?? null;
}

/** Every code the map names, for the ops entry point that backfills existing rows. */
export function canonicalAmenityNames(): ReadonlyMap<string, string> {
  return AMENITY_GROUPS;
}
