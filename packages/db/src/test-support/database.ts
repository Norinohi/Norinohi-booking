import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import * as schema from "../schema";

/**
 * Where the database suites create their throwaway databases.
 *
 * The server's own `DATABASE_URL` is deliberately not read: these suites create and drop whole
 * databases, and pointing that at whatever the developer's server happens to use is how a test
 * run ends up next to real data. The default is the compose database in docker-compose.yml.
 */
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:password@localhost:5434/postgres";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

export type TestDatabase = {
  db: NodePgDatabase<typeof schema>;
  drop: () => Promise<void>;
};

/**
 * A fresh database carrying every committed migration, which is the schema production has.
 *
 * Built from the migrations rather than from the Drizzle schema, so a schema edit that was never
 * generated fails here instead of in the pre-deploy step.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `yc_test_${randomBytes(6).toString("hex")}`;
  const adminUrl = new URL(ADMIN_URL);

  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = drizzle({
    connection: { connectionString: url.toString(), options: "-c jit=off" },
    schema,
  });
  await migrate(db, { migrationsFolder: MIGRATIONS });

  return {
    db,
    drop: async () => {
      await db.$client.end();
      const cleanup = new Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}
