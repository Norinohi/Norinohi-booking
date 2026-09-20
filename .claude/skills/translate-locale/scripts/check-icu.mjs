/**
 * Checks every locale's messages the way next-intl will read them at runtime.
 *
 * `apps/web/scripts/check-messages.mjs` compares key sets and stops there, which leaves the
 * failures a translator actually produces: a message that no longer parses as ICU, a renamed
 * placeholder, a plural missing a form its language needs, a dash the house style forbids.
 * next-intl renders a broken message as its key path rather than throwing, so nothing else
 * catches these.
 *
 *   node .claude/skills/translate-locale/scripts/check-icu.mjs
 *   node .claude/skills/translate-locale/scripts/check-icu.mjs sv no da
 *
 * Exits non-zero on the first locale with problems, listing them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const MESSAGES_DIR = "apps/web/messages";
const REFERENCE = "en";

/*
 * next-intl parses messages with intl-messageformat, so that is what this has to parse them
 * with. It is a transitive dependency, which pnpm keeps out of every workspace's own
 * node_modules, so it is resolved out of the store instead of required by name.
 */
const require = createRequire(import.meta.url);
const { IntlMessageFormat } = require(intlMessageFormatPath());

function intlMessageFormatPath() {
  const store = "node_modules/.pnpm";
  const entry = readdirSync(store).find((name) => name.startsWith("intl-messageformat@"));
  if (!entry) {
    throw new Error(
      `intl-messageformat not found under ${store}. Run pnpm install from the repo root.`,
    );
  }
  return join(process.cwd(), store, entry, "node_modules/intl-messageformat");
}

/**
 * The plural forms a language needs, where "needs" means a missing one reads wrong rather than
 * merely unidiomatic. `other` is mandatory everywhere and is what ICU falls back to.
 *
 * Only the site's own locales are listed. A language absent here is checked for `other` alone.
 */
const PLURAL_FORMS = {
  pl: ["one", "few", "many", "other"],
  uk: ["one", "few", "many", "other"],
};

const locales = process.argv.slice(2);
const wanted =
  locales.length > 0
    ? locales
    : readdirSync(MESSAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== REFERENCE)
        .map((entry) => entry.name);

function flatten(node, prefix, out) {
  for (const [key, value] of Object.entries(node)) {
    if (value !== null && typeof value === "object") flatten(value, `${prefix}${key}.`, out);
    else out.set(`${prefix}${key}`, value);
  }
  return out;
}

function load(locale) {
  const messages = new Map();
  for (const file of readdirSync(join(MESSAGES_DIR, locale))) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(MESSAGES_DIR, locale, file), "utf8"));
    flatten(parsed, `${file.slice(0, -5)}.`, messages);
  }
  return messages;
}

/**
 * Every argument, tag and plural branch an ICU message names, as a comparable set.
 *
 * Compared against the English rather than checked for a pattern: what matters is that the two
 * agree, since the code passes one set of values to both.
 */
function shape(ast, found = new Set()) {
  for (const node of ast) {
    /* type 0 is literal text, which carries a `value` that is not an argument name. */
    if (node.type !== 0 && typeof node.value === "string") found.add(`${node.type}:${node.value}`);
    if (node.options) {
      for (const [branch, option] of Object.entries(node.options)) {
        if (branch.startsWith("=")) found.add(`exact:${branch}`);
        shape(option.value, found);
      }
    }
    if (node.children) shape(node.children, found);
  }
  return found;
}

/** A branch with no letters inflects nothing, so " (#)" needs no per-language forms. */
function inflects(options) {
  return Object.values(options).some((option) =>
    option.value.some((node) => node.type === 0 && /\p{L}/u.test(node.value)),
  );
}

function pluralBranches(ast, into = []) {
  for (const node of ast) {
    /* type 6 is a plural; ordinals pick their forms from a different table. */
    if (node.type === 6 && node.pluralType === "cardinal" && inflects(node.options)) {
      into.push(Object.keys(node.options));
    }
    if (node.options)
      for (const option of Object.values(node.options)) pluralBranches(option.value, into);
    if (node.children) pluralBranches(node.children, into);
  }
  return into;
}

const english = load(REFERENCE);
let failed = false;

for (const locale of wanted) {
  const problems = [];
  const messages = load(locale);
  const required = PLURAL_FORMS[locale] ?? ["other"];

  for (const [key, value] of messages) {
    if (typeof value !== "string") continue;
    if (/[\u2013\u2014]/.test(value)) problems.push(`${key}: em or en dash`);

    const source = english.get(key);
    if (typeof source !== "string") continue;

    let ast;
    try {
      ast = new IntlMessageFormat(value, locale).getAst();
    } catch (cause) {
      problems.push(`${key}: does not parse as ICU (${cause.message})`);
      continue;
    }

    const theirs = [...shape(ast)].sort().join(", ");
    const ours = [...shape(new IntlMessageFormat(source, REFERENCE).getAst())].sort().join(", ");
    if (theirs !== ours)
      problems.push(`${key}: placeholders differ - has [${theirs}], en has [${ours}]`);

    for (const branches of pluralBranches(ast)) {
      const missing = required.filter((form) => !branches.includes(form));
      if (missing.length > 0) problems.push(`${key}: plural missing ${missing.join(", ")}`);
    }
  }

  if (problems.length > 0) {
    failed = true;
    console.error(`\n${locale}: ${problems.length} problem(s)`);
    for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
    if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  }
}

if (failed) process.exit(1);
console.log(`ICU clean: ${wanted.join(", ")}`);
