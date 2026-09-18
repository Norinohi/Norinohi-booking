import { Suspense } from "react";

import { Hydrated } from "@/components/layout/hydrated";
import { RoutesMapScreen } from "@/features/routes";
import { prefetchRoutesMap } from "@/features/routes/api/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/*
 * The map lives here rather than in the pages, so `/routes` and every `/routes/<slug>` share one
 * instance: opening a route is a navigation to its own indexable address, and the map under it
 * stays put instead of being built again. The pages below carry only what differs per URL, the
 * metadata and the heading.
 */
export default async function RoutesLayout({ children }: { children: React.ReactNode }) {
  const state = await prefetchRoutesMap();

  return (
    <Hydrated state={state}>
      {children}
      {/* `useQueryStates` reads the query string, which only exists per request. */}
      <Suspense fallback={null}>
        <RoutesMapScreen />
      </Suspense>
    </Hydrated>
  );
}
