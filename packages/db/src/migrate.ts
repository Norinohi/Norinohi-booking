import { env } from "@yacht-charter/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(migrationsFolder: string) {
  const db = drizzle(env.DATABASE_URL);

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}
