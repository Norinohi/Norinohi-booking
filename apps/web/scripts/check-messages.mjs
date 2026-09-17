/*
 * Every locale must carry exactly the keys `en` does. next-intl falls back to the key path for a
 * missing message, so a gap ships silently as "Booking.review.title" on screen.
 *
 * Also checks that each `messages/<locale>/index.ts` imports every namespace file beside it: a file
 * that exists but is not imported never reaches next-intl, and the key comparison alone would not
 * notice.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = new URL("../messages/", import.meta.url).pathname;
const REFERENCE = "en";

function flatten(node, prefix, out) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value instanceof Object && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

function loadLocale(locale) {
  const dir = join(MESSAGES_DIR, locale);
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  const keys = new Set();
  for (const file of files) {
    const namespace = file.slice(0, -".json".length);
    flatten(JSON.parse(readFileSync(join(dir, file), "utf8")), namespace, keys);
  }

  const index = readFileSync(join(dir, "index.ts"), "utf8");
  const imported = new Set(
    [...index.matchAll(/from "\.\/([^"]+)\.json"/g)].map((match) => match[1]),
  );
  const namespaces = files.map((file) => file.slice(0, -".json".length));
  const notImported = namespaces.filter((namespace) => !imported.has(namespace));

  return { keys, notImported };
}

const locales = readdirSync(MESSAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const reference = loadLocale(REFERENCE);
const problems = [];

for (const locale of locales) {
  const current = locale === REFERENCE ? reference : loadLocale(locale);

  for (const namespace of current.notImported) {
    problems.push(`${locale}: ${namespace}.json is not imported by messages/${locale}/index.ts`);
  }
  if (locale === REFERENCE) continue;

  for (const key of reference.keys) {
    if (!current.keys.has(key)) problems.push(`${locale}: missing ${key}`);
  }
  for (const key of current.keys) {
    if (!reference.keys.has(key)) problems.push(`${locale}: extra ${key}`);
  }
}

if (problems.length > 0) {
  console.error(`Message keys differ from ${REFERENCE} (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `Messages match ${REFERENCE}: ${locales.join(", ")}, ${reference.keys.size} keys each.`,
);
