import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "@yacht-charter/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

/*
 * Records already-applied migrations in drizzle's ledger without re-running them.
 *
 * `db:push` writes schema straight to the database and never touches
 * `drizzle.__drizzle_migrations`, so a database built the fast local way looks
 * untouched to `db:migrate`, which then replays migrations against objects that
 * already exist and fails on the first CREATE. This closes that gap by writing
 * the ledger rows the push never wrote.
 *
 * It asserts nothing about the schema — it cannot, since a migration is arbitrary
 * SQL. Run it only when `db:push` has just made the database current. It is a
 * local recovery tool: production has only ever been migrated, so its ledger is
 * already honest, and marking a migration applied there would skip it forever.
 */

type JournalEntry = { idx: number; tag: string; when: number };
type Journal = { entries: JournalEntry[] };

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function readJournal(): Promise<JournalEntry[]> {
  const raw = await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8");
  return (JSON.parse(raw) as Journal).entries;
}

/** Drizzle keys the ledger on the sha256 of the migration file, verbatim. */
async function hashOf(tag: string): Promise<string> {
  const sql_ = await readFile(join(migrationsFolder, `${tag}.sql`), "utf8");
  return createHash("sha256").update(sql_).digest("hex");
}

async function baselineMigrations({ apply }: { apply: boolean }) {
  if (env.NODE_ENV === "production") {
    throw new Error("db:baseline is a local recovery tool and refuses to run in production");
  }

  const db = drizzle(env.DATABASE_URL);

  try {
    // Same shape drizzle's own migrator creates, so it works on a database that
    // has never been migrated as well as one that is merely behind.
    await db.execute(sql`create schema if not exists drizzle`);
    await db.execute(sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);

    const applied = await db.execute<{ hash: string; created_at: string }>(
      sql`select hash, created_at from drizzle.__drizzle_migrations`,
    );

    // Keyed on the journal timestamp rather than the hash, because that is what
    // drizzle's migrator compares. Keying on the hash would file an
    // already-applied migration whose SQL was later edited as missing and record
    // it twice.
    const known = new Map(applied.rows.map((row) => [Number(row.created_at), row.hash]));

    const entries = await readJournal();
    const missing: { entry: JournalEntry; hash: string }[] = [];

    for (const entry of entries) {
      const hash = await hashOf(entry.tag);
      const recorded = known.get(entry.when);

      if (recorded === undefined) {
        missing.push({ entry, hash });
      } else if (recorded !== hash) {
        // Not something a baseline can repair: the database ran one version of
        // this migration and the repository now holds another.
        console.warn(
          `! ${entry.tag} was applied, then its SQL changed. This database ran the earlier version.`,
        );
      }
    }

    if (missing.length === 0) {
      console.log("Ledger is already complete: every migration in the journal is recorded.");
      return;
    }

    console.log(`${missing.length} migration(s) missing from the ledger:`);
    for (const { entry } of missing) console.log(`  ${entry.idx} ${entry.tag}`);

    if (!apply) {
      console.log("\nDry run. Re-run with --apply once `db:push` has made the schema current.");
      return;
    }

    // Ordered by `when`, because drizzle picks what to apply by comparing each
    // entry against the newest created_at in the ledger.
    for (const { entry, hash } of [...missing].sort((a, b) => a.entry.when - b.entry.when)) {
      await db.execute(sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `);
    }

    console.log(`\nRecorded ${missing.length} migration(s). \`db:migrate\` is now a no-op.`);
  } finally {
    await db.$client.end();
  }
}

baselineMigrations({ apply: process.argv.includes("--apply") })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
