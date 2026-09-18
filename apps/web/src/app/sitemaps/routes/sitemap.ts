import type { MetadataRoute } from "next";

import { routePaths } from "@/features/routes/api/server";
import { entriesFor, safely } from "@/lib/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await safely(routePaths, "routes");
  return paths.flatMap((path) => entriesFor(path));
}
