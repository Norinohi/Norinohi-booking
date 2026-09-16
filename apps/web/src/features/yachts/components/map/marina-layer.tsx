"use client";

import { useTranslations } from "next-intl";

import MapMarker from "@/components/shared/map/map-marker";

import type { MapMarinaData } from "../../api/queries";
import type { useMapClusters } from "../../hooks/use-map-clusters";
import MapClusterMarker from "./map-cluster-marker";

export interface MarinaLayerProps {
  clusters: ReturnType<typeof useMapClusters>["clusters"];
  /** The bases behind the card that is open, so their pin reads as selected. */
  openBaseIds: string[];
  onOpenPlace: (bases: MapMarinaData[], lng: number, lat: number) => void;
  onPressCluster: (clusterId: number, lng: number, lat: number) => void;
}

/** The search's marinas as pins, and as count pills where the zoom still groups them. */
export default function MarinaLayer({
  clusters,
  openBaseIds,
  onOpenPlace,
  onPressCluster,
}: MarinaLayerProps) {
  const t = useTranslations("YachtsMap");

  return clusters.map((feature, index) => {
    const [lng, lat] = feature.geometry.coordinates;
    /*
     * The marina case is taken first, and by the absence of `cluster` rather than by its
     * presence: a cluster's properties are an intersection now that they carry a tally, and
     * an intersection is not a discriminant TypeScript will narrow a compound test through.
     */
    const props = feature.properties;

    if (!("cluster" in props)) {
      /* A marina holding several boats keeps the count pill it wore when those boats were
         separate points; one holding a single boat stays a bare pin, as it always was. */
      return props.count > 1 ? (
        <MapClusterMarker
          key={props.baseId}
          coordinates={{ lat, lng }}
          count={props.count}
          label={t("clusterCount", { count: props.count })}
          order={index}
          onSelect={() => onOpenPlace([props], lng, lat)}
        />
      ) : (
        <MapMarker
          key={props.baseId}
          coordinates={{ lat, lng }}
          label={props.name}
          selected={openBaseIds.includes(props.baseId)}
          order={index}
          onSelect={() => onOpenPlace([props], lng, lat)}
        />
      );
    }

    const { cluster_id: clusterId, count } = props;
    return (
      <MapClusterMarker
        key={`cluster-${clusterId}`}
        coordinates={{ lat, lng }}
        count={count}
        label={t("clusterCount", { count })}
        order={index}
        onSelect={() => onPressCluster(clusterId, lng, lat)}
      />
    );
  });
}
