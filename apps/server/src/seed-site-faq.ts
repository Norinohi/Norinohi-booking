/**
 * Seeds the site-wide FAQ from `packages/db/src/site-faq.json`, in every locale.
 *
 * Unlike the route seeds, this one overwrites: an answer reworded in the admin is replaced by
 * whatever the file says. That is the point when a language is added, and the reason to think
 * before running it otherwise.
 */
import { db } from "@yacht-charter/db";
import { seedSiteFaq } from "@yacht-charter/db/seed-site-faq";

const seeded = await seedSiteFaq();
console.log(`Seeded ${seeded} site-wide FAQ entries.`);

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
