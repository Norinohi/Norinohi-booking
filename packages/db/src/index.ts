import { env } from "@yacht-charter/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

/*
 * A bare connection string defaults node-postgres to a 10-connection pool. That undersized facet
 * aggregation when listSearchFacets fanned out to 11-18 queries per call, so one request could
 * want more connections than the default pool held. It now holds two (packages/db/src/search/
 * facets.ts), but the catalog prerender still fires many search requests concurrently.
 * Under-provisioning doesn't fail loudly, it just queues internally, which is part of why the
 * ~3,900-page prod prerender is slower than its query cost alone would suggest.
 */
export function createDb() {
  return drizzle({
    connection: {
      connectionString: env.DATABASE_URL,
      max: 20,
      /* The search queries are estimated at 20M+ cost, far past jit_above_cost, but finish in a
         second or two; compiling them cost more than running them (lone check-in page 10.6s with
         JIT, 1.5s without). */
      options: "-c jit=off",
    },
    schema,
  });
}

export const db = createDb();
