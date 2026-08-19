import type { MetadataRoute } from "next";

import { BUILT_AT, entriesFor, STATIC_PATHS } from "@/lib/sitemap";

/** The hand-built routes. They only change when a deploy changes them, hence `BUILT_AT`. */
export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_PATHS.flatMap((path) => entriesFor(path, BUILT_AT));
}
