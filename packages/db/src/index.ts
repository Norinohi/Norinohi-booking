import { env } from "@yacht-charter/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

/*
 * A bare connection string defaults node-postgres to a 10-connection pool. That undersizes facet
 * aggregation: listSearchFacets alone fans out to 11-18 queries via Promise.all per call (see
 * packages/db/src/search/repository.ts), so one request can already want more connections than
 * the default pool holds — and the catalog prerender fires many such requests concurrently.
 * Under-provisioning doesn't fail loudly, it just queues internally, which is part of why the
 * ~3,900-page prod prerender is slower than its query cost alone would suggest.
 */
export function createDb() {
  return drizzle({ connection: { connectionString: env.DATABASE_URL, max: 20 }, schema });
}

export const db = createDb();
