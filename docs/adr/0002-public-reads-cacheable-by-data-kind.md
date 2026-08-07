---
status: accepted
---

# Public reads go through a header-free oRPC link and are cached by data kind

`utils/orpc.ts` forwards every incoming request header on server-side calls, which is required for
session-bearing procedures but makes _all_ reads request-dependent — and a `headers()` read is
illegal inside `"use cache"`, so no public read could ever be cached. We are splitting the oRPC
client into a **public link** that forwards no headers and an **authed link** that keeps the current
behaviour, then wrapping the public prefetch helpers in `"use cache"` with a `cacheLife` chosen by
data kind: `days` for facets, `hours` for search results, listing detail and reviews, and **no cache
at all** for availability, quotes and repricing.

## Considered options

- **Add `<Suspense>` but no caching.** Rejected: the shell would paint immediately, but every
  navigation would still cost a full Next → Hono → Postgres round trip, and cached content could
  not enter the static shell at all.
- **Go RSC-native and drop React Query for initial data.** Rejected for now: it rewrites the
  established `features/*/api/server.ts` pattern across many of the 93 client components. Kept as a
  future option if the hydration payload becomes the bottleneck.
- **Cache on the Hono side (HTTP cache headers or Redis).** Rejected as a substitute: it improves
  TTFB but does nothing about the blocking `await`, so the shell still cannot prerender. Not
  mutually exclusive — it remains available later.

## Consequences

- The catalog / booking-critical split in `CONTEXT.md` becomes load-bearing: anything
  booking-critical must use the authed link or an uncached path. Caching a quote is a business
  incident, not a perf regression. The pricing (M4) and booking (M5) work must respect this.
- `dehydrate()` embeds `dataUpdatedAt` timestamps, which freeze at cache-fill time. The client
  `staleTime` (currently 60s in `QUERY_DEFAULTS`) should be aligned per query with its server cache
  tier, or hydrated-from-cache data triggers an immediate background refetch and gives back part of
  the saving.
- Two links exist for one API. This is deliberate: the split _is_ the mechanism that makes public
  reads cacheable. Merging them back re-breaks prerendering.
