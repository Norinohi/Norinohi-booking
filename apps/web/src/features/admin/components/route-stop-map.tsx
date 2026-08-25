"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Marker } from "react-map-gl/mapbox";

import MapCanvas, {
  type MapInstance,
  type MapViewState,
} from "@/components/shared/data-display/map-canvas";

/*
 * The coordinate input for one stop.
 *
 * A pair of number fields is what this table exists to replace: the stops it feeds used to be the
 * charter base shifted by a fixed offset, and a typed 43.06/16.18 is indistinguishable from a
 * typed 46.03/18.16 until somebody opens the listing page. Here the author drags the pin, or taps
 * the water, and the number is whatever the map says it is.
 *
 * The stops already on the route are drawn behind it, unlabelled and dimmed, so a new stop is
 * placed against the shape of the itinerary rather than against an empty sea.
 */

type Point = { lat: number; lng: number };

const PLACED_ZOOM = 9;

export default function RouteStopMap({
  point,
  otherStops,
  centre,
  onMove,
}: {
  /** The stop being placed. Null before the author has put it anywhere. */
  point: Point | null;
  otherStops: { name: string; lat: number; lng: number }[];
  /** Where the map opens when there is no pin yet — the target base, or the first stop. */
  centre: Point;
  onMove: (point: Point) => void;
}) {
  /*
   * Mapbox's own `click` handler is attached once, at construction, so it would close over the
   * first `onMove` it saw and write every later tap into a stale form. The ref is what keeps the
   * handler current without re-registering it on every render.
   */
  const move = useRef(onMove);
  useEffect(() => {
    move.current = onMove;
  }, [onMove]);

  const [map, setMap] = useState<MapInstance | null>(null);

  /*
   * Follows the pin when the pin moves somewhere the camera cannot see.
   *
   * `initialViewState` is resolved once, at construction, so picking a search result put the pin
   * on Vis and left the map looking at Trogir. The bounds test is what keeps this from fighting
   * the author: a drag and a tap both land inside the current view by definition, so only a jump
   * that came from outside the map — a search hit, or selecting an existing stop — moves it.
   */
  useEffect(() => {
    if (!map || !point) return;
    if (map.getBounds()?.contains([point.lng, point.lat])) return;
    map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), PLACED_ZOOM) });
  }, [map, point]);

  const opening: MapViewState = {
    longitude: (point ?? centre).lng,
    latitude: (point ?? centre).lat,
    zoom: PLACED_ZOOM,
  };

  const attachMap = (instance: MapInstance) => {
    instance.on("click", (event) => move.current({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    instance.getCanvas().style.cursor = "crosshair";
    setMap(instance);
  };

  return (
    <MapCanvas dimOpacity={0} initialViewState={opening} onReady={attachMap}>
      {otherStops.map((stop, index) => (
        <Marker
          key={`${stop.lat},${stop.lng}-${index}`}
          longitude={stop.lng}
          latitude={stop.lat}
          anchor="center"
        >
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full border border-white/60 bg-white/25"
          >
            <MapPin className="size-4 fill-natural-500 text-white" />
          </span>
        </Marker>
      ))}

      {point ? (
        <Marker
          longitude={point.lng}
          latitude={point.lat}
          anchor="center"
          draggable
          onDragEnd={(event) => move.current({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
        >
          <span
            aria-hidden
            className="flex size-12 cursor-grab items-center justify-center rounded-full border-2 border-brand bg-brand/30 active:cursor-grabbing"
          >
            <MapPin className="size-6 fill-brand text-white" />
          </span>
        </Marker>
      ) : null}
    </MapCanvas>
  );
}
