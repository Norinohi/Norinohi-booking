import { runMigrations } from "@yacht-charter/db/migrate";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/src/migrations",
);

if (!existsSync(migrationsFolder)) {
  throw new Error(
    `No migrations found at ${migrationsFolder}. Run \`pnpm db:generate\` and commit the result.`,
  );
}

await runMigrations(migrationsFolder);

console.log(`Migrations applied from ${migrationsFolder}`);
