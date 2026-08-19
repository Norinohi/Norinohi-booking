import type { MetadataRoute } from "next";

import { catalogPagePaths, entriesFor, safely } from "@/lib/sitemap";

/** Builders and models. Filed apart from the destination pages: they answer a different query. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await safely(() => catalogPagePaths("shipyard"), "shipyard");
  return paths.flatMap((path) => entriesFor(path));
}
