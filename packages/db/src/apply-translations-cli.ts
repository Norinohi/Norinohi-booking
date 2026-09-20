/**
 * The `translations:apply` entry point. `apply-translations.ts` only exports, so the server can
 * import it into a compiled ops script without a CLI running as a side effect.
 *
 *   pnpm --filter @yacht-charter/db translations:apply
 *   pnpm --filter @yacht-charter/db translations:apply -- --apply
 */
import { applyTranslations } from "./apply-translations";
import { db } from "./index";

try {
  await applyTranslations({ apply: process.argv.slice(2).includes("--apply") });
} catch (error) {
  console.error(error);
  await db.$client.end();
  process.exit(1);
}

await db.$client.end();
