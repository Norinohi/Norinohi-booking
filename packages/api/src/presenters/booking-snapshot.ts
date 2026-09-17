import type { CommercialSnapshot } from "@yacht-charter/db/schema/booking";
import { baseLabel } from "@yacht-charter/db/search";
import type { FacetMediaKind, FacetTranslator } from "@yacht-charter/db/search";

/**
 * A booking's frozen snapshot with its catalogue labels in the reader's language.
 *
 * The snapshot stores the English facet values the search doc held at checkout, so the same
 * `facet_media` copy the search cards read is applied on the way out. Without a translator (the
 * default locale, or no copy stored) the snapshot is returned as it was frozen.
 */
export function localizeSnapshot(
  snapshot: CommercialSnapshot,
  translate: FacetTranslator | undefined,
): CommercialSnapshot {
  if (!translate) return snapshot;
  const optional = (kind: FacetMediaKind, value: string | null) =>
    value === null ? null : translate(kind, value);
  return {
    ...snapshot,
    baseName: baseLabel(translate, snapshot.baseName, snapshot.locationName),
    locationName: translate("location", snapshot.locationName),
    countryName: translate("country", snapshot.countryName),
    category: optional("category", snapshot.category),
    crewType: optional("crew", snapshot.crewType),
    amenities: snapshot.amenities?.map((amenity) => translate("equipment", amenity)),
    specs: snapshot.specs && {
      ...snapshot.specs,
      sailType: optional("sail_type", snapshot.specs.sailType),
    },
  };
}
