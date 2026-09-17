/**
 * A hand-authored itinerary, read from the route library rather than composed here.
 *
 * Every field is somebody's editorial text and every coordinate is the place itself, so nothing
 * in it is translated or derived - which is also why the whole thing is nullable. Most bases have
 * no route, and the section renders only where one exists.
 */
export type SuggestedRoute = {
  title: string;
  description: string | null;
  stops: {
    /** Position in the itinerary, from 1. Not a calendar date: a route is not a charter. */
    day: number;
    name: string;
    note: string | null;
    lat: number;
    lng: number;
  }[];
};
