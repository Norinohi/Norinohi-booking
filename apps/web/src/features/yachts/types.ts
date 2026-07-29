/*
 * TEMPORARY hand-written shapes. Per the app AGENTS.md, request/response types are
 * inferred from `AppRouterClient` — these exist only because the search procedure
 * does not yet. When it lands, replace the bodies here (not the consumers) with
 * inferred types; nothing else should be declaring these fields.
 */
export type Coordinates = { lat: number; lng: number };

export type Marina = {
  id: string;
  name: string;
  /** Street line; the city and country are separate so we can compose per locale. */
  address: string;
  city: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  coordinates: Coordinates;
  /** Static map thumbnail. Generated during catalogue sync, not by the client. */
  mapImageUrl?: string;
};
