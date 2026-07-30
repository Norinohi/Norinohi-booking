import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE = "en";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, nested]) =>
    nested !== null && typeof nested === "object"
      ? flatten(nested, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function load(locale) {
  return new Set(flatten(JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"))));
}

const locales = readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -".json".length));

if (!locales.includes(REFERENCE)) {
  console.error(`messages: no ${REFERENCE}.json to compare against`);
  process.exit(1);
}

const reference = load(REFERENCE);
let drifted = false;

for (const locale of locales.filter((candidate) => candidate !== REFERENCE)) {
  const target = load(locale);
  const missing = [...reference].filter((key) => !target.has(key));
  const unknown = [...target].filter((key) => !reference.has(key));

  if (missing.length || unknown.length) {
    drifted = true;
    console.error(`\n${locale}.json is out of sync with ${REFERENCE}.json:`);
    for (const key of missing) console.error(`  missing  ${key}`);
    for (const key of unknown) console.error(`  unknown  ${key}`);
  }
}

if (drifted) {
  console.error("");
  process.exit(1);
}

console.log(`messages: ${reference.size} keys, ${locales.length} locales in sync`);
