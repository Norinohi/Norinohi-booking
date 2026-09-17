"use client";

import { useFormatter, type DateTimeFormatOptions } from "next-intl";
import { useSyncExternalStore } from "react";

import { formatInstant } from "../lib/instant";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
/* Null on the server and during hydration, so the first client render matches the HTML. */
const serverZone = () => null;

/**
 * Formats timestamps in the viewer's own time zone. Calendar days (check-in, check-out) are not
 * instants and keep going through `dayToDisplay` and the UTC day formats.
 */
export function useInstant() {
  const format = useFormatter();
  const zone = useSyncExternalStore(subscribe, browserZone, serverZone);

  return (value: string, options: DateTimeFormatOptions) =>
    formatInstant(format, value, options, zone);
}
