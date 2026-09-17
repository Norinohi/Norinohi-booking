import type { createFormatter, DateTimeFormatOptions } from "next-intl";

type Formatter = ReturnType<typeof createFormatter>;

/*
 * The request config pins next-intl to UTC, which is right for charter days and wrong for an
 * instant: staff in Kyiv read "22:14" for something they did at 01:14 the next morning. The
 * server cannot know the viewer's zone, so until the browser reports one the text says UTC
 * outright rather than passing a UTC clock off as local.
 */
const SERVER_ZONE = "UTC";

/** Formats a real instant (an ISO string with its offset) in `viewerZone`, or labelled UTC without one. */
export function formatInstant(
  format: Formatter,
  value: string,
  options: DateTimeFormatOptions,
  viewerZone: string | null,
): string {
  const text = format.dateTime(new Date(value), {
    ...options,
    timeZone: viewerZone ?? SERVER_ZONE,
  });
  const showsTime = options.timeStyle !== undefined || options.hour !== undefined;
  return viewerZone === null && showsTime ? `${text} ${SERVER_ZONE}` : text;
}

/** The `dayShort` shape without its pinned UTC zone, for an instant shown to the day. */
export const SHORT_DAY = {
  day: "numeric",
  month: "short",
  year: "numeric",
} as const satisfies DateTimeFormatOptions;
