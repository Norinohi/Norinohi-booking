import { z } from "zod";

import type { JsonField } from "./json";

/** Only these reach a customer's browser as an href; anything else is dropped. */
const CREW_LIST_LINK_SCHEMES = new Set(["http:", "https:"]);

/**
 * A value that is fit to be a link on our own pages: a string, and an absolute
 * http(s) URL once trimmed. Everything else - a number, a null, a relative path, a
 * `javascript:` payload - fails here rather than downstream.
 */
export const crewListLinkSchema = z
  .string()
  .trim()
  .refine((value) => {
    const url = URL.parse(value);
    /* NauSYS's PDF example has the literal segment `/null/` where the code belongs, which is a
       page that opens on nothing. */
    return (
      url !== null &&
      CREW_LIST_LINK_SCHEMES.has(url.protocol) &&
      !url.pathname.split("/").includes("null")
    );
  });

/**
 * The vendor's crew-list page as a link we may show, or nothing. The vendor is not the right
 * party to decide what scheme our pages follow, so a value that is not an http(s) URL is
 * dropped rather than passed on.
 */
export function crewListLinkFrom(value: JsonField): string | undefined {
  const link = crewListLinkSchema.safeParse(value);
  return link.success ? link.data : undefined;
}
