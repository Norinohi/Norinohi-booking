import type { MetadataRoute } from "next";

import { catalogPagePaths, entriesFor, safely } from "@/lib/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await safely(() => catalogPagePaths("yacht-charter"), "catalog");
  return paths.flatMap((path) => entriesFor(path));
}
