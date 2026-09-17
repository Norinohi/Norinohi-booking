import Supercluster from "supercluster";
import { describe, expect, it } from "vitest";

import { snapToSameHarbour } from "./same-harbour";

const marina = (baseId: string, lat: number, lng: number, count: number) => ({
  baseId,
  lat,
  lng,
  count,
});

/* The two vendors' bases at Rogač on Šolta, as the search read model holds them. */
const bookingManager = marina("base_bm", 43.395339, 16.299214, 10);
const nausys = marina("base_nausys", 43.39552, 16.29842, 12);
/* ACI Marina Split and Marina Kaštela, 12 km apart. */
const split = marina("base_split", 43.5034, 16.4313, 30);
const kastela = marina("base_kastela", 43.546021, 16.401395, 241);

describe("snapToSameHarbour", () => {
  it("puts two vendors' bases for one harbour on the busier one's coordinate", () => {
    const snapped = snapToSameHarbour([bookingManager, nausys, split]);

    expect(snapped).toEqual([
      { ...bookingManager, lat: nausys.lat, lng: nausys.lng },
      nausys,
      split,
    ]);
  });

  it("leaves marinas in different harbours where they are", () => {
    expect(snapToSameHarbour([split, kastela])).toEqual([split, kastela]);
  });

  it("does not chain a line of quays into one spot", () => {
    const west = marina("west", 43.5, 16.4, 50);
    const middle = marina("middle", 43.5, 16.4033, 5); // about 266 m east
    const east = marina("east", 43.5, 16.4066, 1); // about 266 m further

    const snapped = snapToSameHarbour([west, middle, east]);

    expect(snapped[1]).toMatchObject({ lat: west.lat, lng: west.lng });
    expect(snapped[2]).toMatchObject({ lat: east.lat, lng: east.lng });
  });

  it("gives the map one pin that no zoom splits, counting both harbours' boats", () => {
    const index = new Supercluster<typeof bookingManager, { count: number }>({
      radius: 60,
      maxZoom: 22,
      map: (props) => ({ count: props.count }),
      reduce: (accumulated, props) => {
        accumulated.count += props.count;
      },
    });
    index.load(
      snapToSameHarbour([bookingManager, nausys]).map((props) => ({
        type: "Feature",
        properties: props,
        geometry: { type: "Point", coordinates: [props.lng, props.lat] },
      })),
    );

    const [pin, ...rest] = index.getClusters([16.2, 43.3, 16.4, 43.5], 18);
    expect(rest).toEqual([]);
    expect(pin?.properties).toMatchObject({ cluster: true, count: 22 });
    /* Past the map's own ceiling of 18, which is what makes a tap open the card for both. */
    expect(index.getClusterExpansionZoom(Number(pin?.id))).toBeGreaterThan(18);
  });
});
