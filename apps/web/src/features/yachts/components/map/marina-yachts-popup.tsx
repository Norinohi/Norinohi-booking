"use client";

import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { useState } from "react";

import { DEFAULT_FILTERS, type FiltersState } from "@/components/shared/form/filters";
import type { Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import type { Link } from "@/i18n/navigation";

import { MARINA_PAGE_SIZE, marinaListingsQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useSearchInput } from "../../hooks/use-search-input";
import MapBoatPopup from "./map-boat-popup";
import MapBoatSkeleton from "./map-boat-skeleton";

export interface MarinaYachtsPopupProps {
  coordinates: Coordinates;
  /** Every name the marina's bases are filed under, as `marina` filter values. */
  marinas: string[];
  /** Narrows the boats the way the page asking already does, a route's length and country. */
  filters: Partial<FiltersState>;
  map: MapInstance | null;
  catalogueHref: ComponentProps<typeof Link>["href"];
}

/**
 * A marina's boats as the search map shows them: one card at a time with a pager, fetched a page
 * at a time, and a way on to all of them in the catalogue, in a new tab so the page asking stays.
 *
 * For surfaces other than the search map, which drives the same card from its own selection
 * state. A card-shaped skeleton stands in until the first page arrives: with nothing on screen for
 * the second the page takes, a click read as missed and got pressed again.
 */
export default function MarinaYachtsPopup({
  coordinates,
  marinas,
  filters,
  map,
  catalogueHref,
}: MarinaYachtsPopupProps) {
  const [index, setIndex] = useState(0);
  const { toCard } = useListingCards();
  const input = useSearchInput({ ...DEFAULT_FILTERS, ...filters }, DEFAULT_FILTERS, {
    sort: "recommended",
    page: 1,
  });
  const page = Math.floor(index / MARINA_PAGE_SIZE) + 1;
  const { data } = useQuery(marinaListingsQueryOptions(input, marinas, page));

  if (!data) return <MapBoatSkeleton coordinates={coordinates} map={map} />;
  return (
    <MapBoatPopup
      coordinates={coordinates}
      boats={data.items.map((item) => toCard(item.listing, item, true))}
      total={data.pagination?.totalItems ?? data.items.length}
      pageStart={(page - 1) * MARINA_PAGE_SIZE}
      onActiveIndex={setIndex}
      map={map}
      catalogueHref={catalogueHref}
      catalogueInNewTab
    />
  );
}
