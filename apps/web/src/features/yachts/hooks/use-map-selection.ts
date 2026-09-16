"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { MapInstance } from "@/components/shared/map/map-canvas";
import { MAP_MARINA_ZOOM } from "@/lib/mapbox";

import { listingSummariesQueryOptions, type MapMarinaData } from "../api/queries";
import { type Descent, descentTo, flyIntoCluster } from "../lib/map-flights";
import type { useMapClusters } from "./use-map-clusters";

/**
 * The marina whose card is open, and the descent that opened it.
 *
 * Its boats are not here: a marina can hold hundreds and they arrive a page at a time, keyed by the
 * card the visitor is looking at.
 */
export type OpenMarina = {
  /** Every base under the pin. One usually; several where marinas sit a stone's throw apart. */
  baseIds: string[];
  /** The same marinas as `marina` filter values, for handing them to the list and the catalogue. */
  values: string[];
  lat: number;
  lng: number;
  /** Boats across all of them, which is the number the pin itself was showing. */
  count: number;
  /** Set where the camera still has to come down to the marina; the popup's own opening does it. */
  focusZoom?: number;
  /** Paired with it: how long that descent runs, scaled to how far it has to come. */
  focusDurationMs?: number;
};

type MarinaIndex = ReturnType<typeof useMapClusters>["supercluster"];

/**
 * What is open on the search map - one boat, or one marina's boats - and how the camera gets there.
 *
 * `focusListingId` is the boat the URL names, `searchKey` the search the map is showing: a new
 * search closes whatever was open under the old one.
 */
export function useMapSelection(
  map: MapInstance | null,
  supercluster: MarinaIndex,
  focusListingId: string | null,
  searchKey: string,
) {
  const [selectedListingId, setSelectedListingId] = useState<string | null>(focusListingId);
  const [openMarina, setOpenMarina] = useState<OpenMarina | null>(null);
  /** Which of the open marina's boats is on screen, counted across all of them, not per page. */
  const [marinaIndex, setMarinaIndex] = useState(0);
  /* The descent owed to a boat the visitor pressed, held the same way a cluster holds its own. */
  const [selectedDescent, setSelectedDescent] = useState<Descent | null>(null);
  const [focusDone, setFocusDone] = useState(false);

  /*
   * A deep link names a boat, and the map only knows places — so the boat is fetched by name rather
   * than looked for among the marinas. That is also what keeps the link working when the search it
   * lands in excludes that boat, which used to leave the visitor on an empty map.
   */
  const { data: linked } = useQuery(
    listingSummariesQueryOptions(selectedListingId ? [selectedListingId] : []),
  );
  const selected = linked?.[0];

  function dismiss() {
    setSelectedListingId(null);
    setOpenMarina(null);
    setSelectedDescent(null);
  }

  /*
   * Opens whatever the visitor pressed, and brings the camera down to it.
   *
   * Takes a list because a pin is not always one marina: two of them can share a spot too tightly
   * for any zoom to separate, and then the pin counts both. The card has to count both as well, or
   * the pager promises a number the marina cannot reach.
   *
   * The descent matters as much as the card. Without it the visitor read a marina's name and price
   * over the coastline they pressed from, with no idea which of the bays below it sits in.
   */
  function openPlace(bases: MapMarinaData[], lng: number, lat: number) {
    setSelectedListingId(null);
    setSelectedDescent(null);
    setMarinaIndex(0);

    const opened: OpenMarina = {
      baseIds: bases.map((base) => base.baseId),
      values: [...new Set(bases.map((base) => base.value))],
      lat,
      lng,
      count: bases.reduce((total, base) => total + base.count, 0),
    };

    const descent = map ? descentTo(map) : null;
    if (descent) {
      opened.focusZoom = descent.focusZoom;
      opened.focusDurationMs = descent.focusDurationMs;
    }

    setOpenMarina(opened);
  }

  /*
   * Clicking a cluster frames the boats it actually holds.
   *
   * The boats decide the zoom, rather than a fixed step above the current one: a step overshoots a
   * tight cluster and undershoots a spread one, and neither lands with the group filling the screen.
   * Called from the marker's onClick (after touchend), so mapbox no longer cancels the flight.
   *
   * A cluster is split whenever any zoom the map allows would split it, and the ceiling asked for
   * is the map's own. A lower one used to stand here, from when the points were boats sharing a
   * marina's coordinate; against marinas it made the map give up early, answering a pin that read
   * "170" with a card for one of the two places behind it. The visitor could see both by zooming in
   * by hand, which is the map admitting it should have done that itself.
   *
   * The card is for what nothing separates: several bases on all but the same spot. It rides the
   * popup's own opening rather than being flown separately, or the two fight for the camera and the
   * card ends up somewhere the visitor is not looking.
   */
  function pressCluster(clusterId: number, lng: number, lat: number) {
    setSelectedListingId(null);
    const leaves = supercluster.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties);
    const expansionZoom = supercluster.getClusterExpansionZoom(clusterId);

    const ceiling = map?.getMaxZoom() ?? MAP_MARINA_ZOOM;

    if (map && expansionZoom <= ceiling) {
      setOpenMarina(null);
      flyIntoCluster(map, leaves, expansionZoom, ceiling);
      return;
    }

    /* A cluster no zoom can break apart is several marinas on all but the same spot. Open them
       together: the pin counted them together, and the card has to agree with the pin. */
    openPlace(leaves, lng, lat);
  }

  /* Tracked apart from the camera's own framing of a search, but by the same test: the first
     search a map shows is its arrival, not a change, and must not close the card a link opened. */
  const shownSearch = useRef<{ map: MapInstance; key: string } | null>(null);
  useEffect(() => {
    if (!map) return;
    const previous = shownSearch.current;
    shownSearch.current = { map, key: searchKey };
    if (previous?.map === map && previous.key !== searchKey) dismiss();
  }, [map, searchKey]);

  /*
   * What is open on the map follows the URL, re-read every time a map is built.
   *
   * Next keeps this route mounted once it has been visited (Activity), so the `useState` initialisers
   * above do not run again on the way back — and an effect watching only the parameter does not fire
   * either, because a parameter that is absent both times has not changed. A card opened on one visit
   * therefore came back on the next, hanging over a URL that named no boat at all.
   *
   * The map instance is the honest signal for "this is a new visit": it is torn down on the way out
   * and rebuilt on the way in, exactly once each. Its children only render once that new map is idle,
   * which is after this has run, so the stale card never gets a frame to appear in.
   */
  useEffect(() => {
    if (!map) return;
    setSelectedListingId(focusListingId);
    setOpenMarina(null);
    setSelectedDescent(null);
    setFocusDone(false);
  }, [map, focusListingId]);

  /*
   * Deep link from a listing's "See on map": the target boat's popup opens (selectedListingId is
   * seeded from the URL) and, the first time it does, its open animation also zooms in — one motion,
   * instead of a flyTo that the popup's own recenter would immediately override. Consumed once so a
   * later tap on the same boat doesn't yank the zoom back out.
   *
   * The button that sends visitors here now writes the camera into the link, so ordinarily the map
   * has already opened on the boat and `descentTo` finds nothing left to do. This is what covers the
   * rest: a `?selected=` URL that was bookmarked or passed on before the camera rode along.
   *
   * Spent by the card once it has actually ordered the flight, not by an effect watching this value.
   * The card opens only after the map has settled, and the markers can arrive before that — so a
   * flag cleared on render was routinely cleared first, and the deep link then merely panned.
   */
  const detailDescent =
    map && !focusDone && focusListingId && selected?.id === focusListingId ? descentTo(map) : null;

  /* One card, two ways of arriving at it: followed here by a link, or pressed on the map. */
  const selectedFocus = detailDescent ?? selectedDescent;

  function focusApplied() {
    setFocusDone(true);
    setSelectedDescent(null);
  }

  return {
    selected,
    selectedFocus,
    focusApplied,
    openMarina,
    marinaIndex,
    setMarinaIndex,
    openPlace,
    pressCluster,
    dismiss,
  };
}
