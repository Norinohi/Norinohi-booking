"use client";

import { env } from "@yacht-charter/env/web";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Component, createContext, type ReactNode, useContext, useRef, useState } from "react";
import type { ComponentProps } from "react";
import Map, { GeolocateControl, type MapEvent, NavigationControl } from "react-map-gl/mapbox";

import { MAP_STYLE_STREETS_URL, MAP_STYLE_URL } from "@/lib/mapbox";

export const MAP_STYLES = { satellite: MAP_STYLE_URL, streets: MAP_STYLE_STREETS_URL } as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

/** Listed rather than derived from the object, so the switch's order is a decision, not a side effect. */
export const MAP_STYLE_KEYS: MapStyleKey[] = ["satellite", "streets"];

/* Read rather than passed, because the surface that offers the choice — a dialog — sits above a
   map it was handed as a child and cannot reach into it. Satellite where nothing offers it. */
const MapStyleContext = createContext<MapStyleKey>("satellite");

export const MapStyleProvider = MapStyleContext.Provider;

const DIM_LAYER_ID = "design-dim";
const DIM_OPACITY = 0.15;

const DEFAULT_VIEW_STATE = { longitude: 16.44, latitude: 43.51, zoom: 6.4 };
const MAX_RECOVERIES = 10;

/*
 * The range a visitor can drive the camera through.
 *
 * The floor is where one world still fills a wide container, so there is no zoom at which a second
 * copy of the Adriatic — and a second set of its markers — can be panned into frame. The ceiling is
 * about a pontoon: past it the satellite tiles run out and the reward for zooming is blurred water.
 */
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;

function styleBasemap(map: MapInstance, opacity: number) {
  if (opacity <= 0 || map.getLayer(DIM_LAYER_ID)) return;

  map.addLayer({
    id: DIM_LAYER_ID,
    type: "background",
    paint: { "background-color": "#000000", "background-opacity": opacity },
  });
}

export type MapInstance = MapEvent["target"];

/*
 * The library's own camera type, which also accepts `bounds`. Worth taking whole rather than
 * narrowing to a centre and a zoom: bounds are resolved while the map is being constructed, from
 * the real size of the container, so a map that has to frame several places opens already framed
 * instead of opening somewhere else and jumping.
 */
export type MapViewState = NonNullable<ComponentProps<typeof Map>["initialViewState"]>;

type MapCanvasProps = {
  children?: ReactNode;
  onReady?: (map: MapInstance) => void;
  onBackgroundPress?: () => void;
  /** Where the map opens. Defaults to the Adriatic, which is what the search map wants. */
  initialViewState?: MapViewState;
  /**
   * How dark the design's wash over the basemap is, `0` for none.
   *
   * Slight by default, so the search map's markers read without burying the imagery under them.
   * Pass `0` wherever the map itself is the thing being looked at.
   */
  dimOpacity?: number;
  /**
   * Called after every *later* style load, never the first.
   *
   * Switching styles throws away every source and layer added by hand, so anything a caller drew
   * itself has to be drawn again. The first load is `onReady`'s, which also positions the camera —
   * something a style change must not disturb.
   */
  onStyleChange?: (map: MapInstance) => void;
  /** Zoom buttons over the map. On wherever a visitor can drive the camera at all. */
  controls?: boolean;
  /** A "find my location" button above them. Only where the visitor's own position means something. */
  locateControl?: boolean;
  minZoom?: number;
  maxZoom?: number;
};

function MapSurface({
  children,
  onReady,
  onBackgroundPress,
  initialViewState = DEFAULT_VIEW_STATE,
  dimOpacity = DIM_OPACITY,
  onStyleChange,
  controls = true,
  locateControl = false,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
}: MapCanvasProps) {
  const [ready, setReady] = useState(false);
  const styleKey = useContext(MapStyleContext);
  const t = useTranslations("Common.map");

  function dismissPopup(target: EventTarget | null) {
    if (target instanceof Element && target.closest(".mapboxgl-marker")) return;
    onBackgroundPress?.();
  }

  return (
    <Map
      mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      mapStyle={MAP_STYLES[styleKey]}
      style={{ width: "100%", height: "100%" }}
      minZoom={minZoom}
      maxZoom={maxZoom}
      renderWorldCopies={false}
      /* Mapbox writes the labels on its own controls itself. Handed the app's translations, or they
         are the only English left on a Ukrainian page. */
      locale={{
        "NavigationControl.ZoomIn": t("zoomIn"),
        "NavigationControl.ZoomOut": t("zoomOut"),
        "GeolocateControl.FindMyLocation": t("locate"),
        "GeolocateControl.LocationNotAvailable": t("locateUnavailable"),
      }}
      onLoad={(event) => {
        const map = event.target;

        /* Attached after the first style has loaded, so it only ever hears the later ones. */
        map.on("style.load", () => {
          styleBasemap(map, dimOpacity);
          onStyleChange?.(map);
        });

        styleBasemap(map, dimOpacity);
        onReady?.(map);
      }}
      onIdle={() => setReady(true)}
      onMouseDown={(event) => dismissPopup(event.originalEvent.target)}
      onTouchStart={(event) => dismissPopup(event.originalEvent.target)}
    >
      {/*
       * Mapbox's own, restyled in `index.css` rather than rebuilt: it already knows to grey a button
       * out at the end of the zoom range, and to run the permission prompt behind "find me".
       *
       * Both go bottom-right, and a control added to a bottom corner is *prepended* — so the order
       * here is the reverse of the order on screen, and locate ends up above zoom, above the credit.
       */}
      {controls ? <NavigationControl position="bottom-right" showCompass={false} /> : null}
      {locateControl ? (
        <GeolocateControl position="bottom-right" positionOptions={{ enableHighAccuracy: true }} />
      ) : null}

      {ready ? children : null}
    </Map>
  );
}

/*
 * Unmount the map the moment its route stops being the current one. Next keeps a navigated-away route
 * mounted-but-hidden (React Activity) and reconnects it later — but react-map-gl can't survive that
 * reconnect (its markers re-attach to a torn Mapbox instance and crash). Dropping the map here, while
 * the route is hidden, means it mounts fresh on return instead of reconnecting a stale one: no crash,
 * no flicker. `usePathname` is the raw locale-prefixed path, so a locale switch also counts as leaving.
 */
function RoutedMap(props: MapCanvasProps) {
  const pathname = usePathname();
  const mountPath = useRef(pathname);
  if (pathname !== mountPath.current) return <div className="size-full bg-natural-50" />;
  return <MapSurface {...props} />;
}

/*
 * Safety net for the reconnect the route gate can't pre-empt in time (a very fast away-and-back before
 * the hidden re-render lands). react-map-gl throws "Cannot read properties of undefined (reading
 * 'appendChild')" from a reconnected passive effect; `reuseMaps` deadlocks and unmounting on a
 * visibility signal feedback-loops, so we recover: catch it, drop the torn surface, and remount a
 * fresh map (a new `key` resets RoutedMap). Capped so a genuinely broken map settles on a static panel
 * rather than looping. Shared by the full map page and the detail route map.
 */
export default class MapCanvas extends Component<
  MapCanvasProps,
  { epoch: number; crashed: boolean }
> {
  state = { epoch: 0, crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidUpdate(_prevProps: MapCanvasProps, prevState: { crashed: boolean }) {
    if (this.state.crashed && !prevState.crashed && this.state.epoch < MAX_RECOVERIES) {
      this.setState((state) => ({ epoch: state.epoch + 1, crashed: false }));
    }
  }

  render() {
    if (this.state.crashed) return <div className="size-full bg-natural-50" />;
    return <RoutedMap key={this.state.epoch} {...this.props} />;
  }
}
