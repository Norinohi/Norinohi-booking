"use client";

import { useEffect, useRef } from "react";

import { paddingOf, samePadding } from "@/components/shared/map/camera";
import type { MapInstance } from "@/components/shared/map/map-canvas";

// Breathing room the camera keeps around whatever it frames, so a marker on the outermost boat is
// inside the picture rather than balanced on its edge.
const MARKER_CLEARANCE = 80;

/*
 * How long the map takes to give up the width a panel has just claimed, or to take it back.
 *
 * `setPadding` moves the camera the instant it is called, so opening the list made the map flinch
 * sideways by half the panel. Close to the 200ms the chrome around it fades in, so the two read as
 * one movement rather than a panel arriving and the map reacting to it.
 */
const PANEL_SHIFT_MS = 250;

/**
 * The box the camera composes within: the container, less the panels lying over it and less a
 * margin all round.
 *
 * Held on the map itself rather than passed per call, because mapbox reads it into every camera
 * move — a cluster opening, a popup recentring, the opening view — and because `fitBounds` writes
 * whatever padding it was given back onto the map. Given the standing value it writes back the
 * same number; given a fresh sum it would grow the margins a little on every click.
 *
 * `panelsKey` is whatever opens or closes a panel; a change in it is what gets eased.
 */
export function useMapPadding(map: MapInstance | null, panelsKey: boolean) {
  const shellRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  /* False until the map has been given its first padding, which is the one that must not animate:
     the visitor has not opened anything yet, they are just arriving. */
  const panelsSettled = useRef(false);

  useEffect(() => {
    const shell = shellRef.current;
    if (!map || !shell) return;

    /* Seeded from the map so a first pass that changes nothing does not jump the camera, which
       would put a `zoom` and a `centre` in the URL of a visitor who never touched the map. */
    let applied = paddingOf(map);

    const apply = (animate: boolean) => {
      const box = shell.getBoundingClientRect();
      if (box.width === 0) return;

      const claimed = (panel: Element | null) => {
        if (!panel) return 0;
        const rect = panel.getBoundingClientRect();
        if (rect.width === 0) return 0;
        const right = rect.right - box.left;
        /* Only a panel hugging the left edge narrows the map sideways. A full-width sheet on a
           phone covers the bottom instead, which the popup answers with its own offset. */
        return right < box.width / 2 ? right : 0;
      };

      /*
       * The filter button and its chips lie along the top edge, and a search with a few filters
       * wraps them onto a second row: a fit framed against the bare container put Istria's
       * cluster underneath "Country: Croatia". Only a bar in the top half counts, for the same
       * reason as the panels above.
       */
      const topBar = (() => {
        const bar = controlsRef.current;
        if (!bar) return 0;
        const rect = bar.getBoundingClientRect();
        if (rect.height === 0) return 0;
        const bottom = rect.bottom - box.top;
        return bottom < box.height / 2 ? bottom : 0;
      })();

      /* Kept well inside the container: mapbox abandons a fit whose padding leaves it no room,
         and a flat 80 a side very nearly does that on a phone. */
      const clearance = Math.min(MARKER_CLEARANCE, box.width / 6, box.height / 6);
      const next = {
        top: topBar > 0 ? topBar + clearance / 2 : clearance,
        right: clearance,
        bottom: clearance,
        left: Math.max(claimed(filtersRef.current), claimed(listRef.current)) + clearance,
      };

      if (samePadding(next, applied)) return;

      applied = next;

      /* Eased where a panel opened or closed, because that is a movement the visitor caused and
         should be able to follow. Jumped on the first pass and on a resize, where the map is
         already being rebuilt around them and an animation would only lag behind the drag. */
      if (animate) map.easeTo({ padding: next, duration: PANEL_SHIFT_MS });
      else map.setPadding(next);
    };

    apply(panelsSettled.current);
    panelsSettled.current = true;

    const observer = new ResizeObserver(() => apply(false));
    observer.observe(shell);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, [map, panelsKey]);

  return { shellRef, filtersRef, listRef, controlsRef };
}
