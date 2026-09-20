---
name: translate-locale
description: How to add a language to the yacht-charter marketplace, or retranslate one - UI messages, database content, catalogue labels, and the checks that catch a broken translation. Use when adding, removing or reworking a locale, when a native reviewer's corrections come back, or when a namespace's keys change and every locale has to follow. TRIGGER when the task names a language or locale code, or touches apps/web/messages, packages/db/src/translations, or packages/db/src/locales.ts.
---

# Adding a language (yacht-charter)

A language is four separate bodies of text, and only the first is code:

1. **The locale list** - `packages/db/src/locales.ts`, read by the web routing, the API enums, the seeds and the provider sync.
2. **UI messages** - `apps/web/messages/<locale>/<Namespace>.json`, one file per namespace, every locale holding the same keys.
3. **Database content** - routes, stop notes, the site FAQ and boat types, seeded from JSON in `packages/db/src`.
4. **Catalogue labels** - country, region, equipment and category names, plus the priced extras a customer reads on a line item.

Doing 1 and 2 and stopping leaves a site whose chrome is translated and whose boats are English. Budget for all four.

## Before translating anything

Read `docs/i18n/glossary.md`. It holds the terms this product has already decided on, per locale, and the disagreements still open. A translator who does not read it invents a second word for "bareboat", and nobody notices until a native reviewer reads two screens side by side.

If the glossary has no entry for a term the new language needs, add the entry as part of the work rather than deciding silently in one file.

## 1. The locale list

`packages/db/src/locales.ts` is the single source. Add the code to `TRANSLATED_LOCALES` and everything downstream follows: `SITE_LOCALES`, the Zod enums, `CONTENT_LOCALES` for the provider sync, the admin editors' panes, `generateStaticParams`.

Then the handful of places that genuinely need a per-language decision, which the compiler will point at:

- `apps/web/src/i18n/config.ts` - `localeNames`, the English name shown in the switcher.
- `apps/web/src/lib/seo.ts` - the Open Graph territory tag (`sv_SE`, `nb_NO`).
- `apps/web/src/features/booking/lib/stripe.ts` - Stripe's own locale, which is not always ours: Norwegian is `no` here and `nb` there, and a language Stripe does not ship falls through to `auto`.
- `apps/web/messages/*/Admin.json` - the language-name blocks (`Faq.locales`, `Faq.localeCodes`, `Popular.media.locales`, `Routes.dialog.locales`) gain a row in **every** locale, including the new one.
- `apps/web/src/i18n/config.ts` - `prerenderedCatalogLocales` only if the new language is meant to prerender its catalogue pages in full. Leaving it out is the default: the build then renders one page per root and the rest on first request.

Never restate the locale list anywhere else. When a new screen needs "one value per language", use `perSiteLocale` / `perTranslatedLocale` (Zod schemas) or `perSiteLocaleValue` / `perTranslatedLocaleValue` (typed records) from `@yacht-charter/db/locales`, re-exported for the web through `@yacht-charter/api/lib/locales`.

## 2. UI messages

Copy nothing: translate `apps/web/messages/en` into `apps/web/messages/<locale>`, same file names, same keys, same order, plus an `index.ts` copied from any existing locale.

The rules a translation has to obey:

- **ICU placeholders and tags are untouchable.** `{count}`, `{name}`, `<link>...</link>`, and the `#` inside a plural. Reorder them in the sentence if the language wants, never rename them.
- **Plural categories are per language.** Polish needs `one`, `few`, `many`, `other`; most of the rest need `one` and `other`; `other` is always mandatory. Keep any `=0` / `=1` branch the English has.
- **Apostrophes fight ICU.** A straight `'` next to a brace escapes the syntax, so in a value that contains ICU braces write the typographic `’` instead. French, Italian and Dutch hit this constantly.
- **No em dash and no en dash**, anywhere, in any locale. A plain hyphen, a comma, or a colon.
- Brand and provider names (YachtSkanner, NauSYS, Booking Manager), currency codes and IBAN-style examples stay as they are. Sample names and phone numbers are worth localising.

`Admin.json` is 55 KB and is the file a careless pass silently truncates. Translate it in chunks and reassemble against the English key order.

### Splitting the work

One agent per language, each writing only inside its own `messages/<locale>` folder, is what keeps parallel work from colliding. Give each agent the glossary, the plural rules for its language, and an existing locale to read for tone. Tell it explicitly not to touch shared files: the English source, the config, `git`.

If the English source gains keys while translators are working (adding a language does exactly that, through the `Admin.json` language-name blocks), fix it up centrally afterwards rather than asking every agent to re-run.

## 3. Database content

The customer-facing copy lives in checked-in JSON, keyed by locale:

| File | What it holds |
| --- | --- |
| `packages/db/src/catalogue-routes.json` | 48 sailing routes: title, description, and a note per stop |
| `packages/db/src/catalogue-stop-refresh.json` | stop notes for the twelve featured routes |
| `packages/db/src/popular-routes.json` | the home page's route cards |
| `packages/db/src/site-faq.json` | the site-wide FAQ |
| `packages/db/src/boat-types.json` | boat-type cards |
| `packages/db/src/translations/facet-labels.json` | facets no provider translates |

Their Zod schemas demand every locale, so a half-filled file fails on import rather than at a write. `RETURN_NOTE` in `packages/db/src/catalogue-routes-seed.ts` is the one such string that lives in code.

The workable shape is: extract the English into one flat file, hand that to a translator per language, merge the answers back with a script that fails on a missing key, a blank value or a dash. Working this way also means one sentence repeated across routes is translated once, so the wording matches everywhere.

## 4. Catalogue labels and extras

Two sources, and which one applies depends on the provider:

- **NauSYS names its reference lists in eighteen languages**, and the sync stores the ones the site serves (`CONTENT_LOCALES`). For a language it does carry, run `pnpm --filter @yacht-charter/providers facets:backfill -- --apply` after adding the locale: it replays stored payloads, calls no vendor, and fills in the labels that were being dropped. Check the fixtures for a `text<CODE>` key before assuming a language is covered: Swedish and Norwegian are, Danish is not.
- **A language no provider names** needs a generated set of its own: `packages/db/src/translations/<locale>.json`, registered in `translations/generated.ts`, written by `translations:apply` as `source = 'generated'` so the sync and the editorial copy both outrank it. Ukrainian and Danish work this way.

A handful of facet values carry hand-written editorial copy from `seed.ts` (Croatia, Greece, Italy, Spain, Thailand, Dalmatia, Cyclades, Campania) in only some locales. For a generated locale, name them in its file too, or the busiest country chips on the site stay English.

**Priced extras** are the long tail: about 9,300 curated names in `translations/extra-labels.json`, keyed by the vendor's English. The new locales are optional in that schema on purpose. Translating the top 1,500 by usage covers around 86 per cent of what customers actually see; `pnpm --filter @yacht-charter/db translations:missing-extras -- --locale <code>` ranks what is left, busiest first.

## Checks

Run all of these. The first four are cheap and catch most of the damage:

```bash
node apps/web/scripts/check-messages.mjs                # key parity across every locale
node .claude/skills/translate-locale/scripts/check-icu.mjs   # ICU, placeholders, plurals, dashes
pnpm check-types
pnpm test
npx oxfmt <changed files> && npx oxlint <changed .ts/.tsx>
```

`check-messages` only compares key sets. `check-icu.mjs` is the one that catches a message that will throw at runtime, a placeholder a translator renamed, a Polish plural missing `few`, and a stray em dash.

Then the browser, against `preview_start` with the `dev` config: home, search, a yacht page, a booking step, a catalogue page, and the language switcher moving between every locale while keeping the path and the query. Read `hreflang` on one page and confirm the new code is in it.

Two provider tests assert the exact set of vendor labels a fixture carries (`packages/providers/src/nausys/projection.test.ts`). A language NauSYS ships will make them fail with the new label in the diff; that is the test doing its job, so add the label. Where a test needs a language the site does **not** serve, use `hr`.

## Applying it locally, and to production

Nothing above reaches a database by being committed. Locally:

```bash
pnpm db:start
cd apps/server && node --env-file-if-exists=.env --import tsx src/seed-popular-routes.ts --apply
cd apps/server && node --env-file-if-exists=.env --import tsx src/seed-catalogue-routes.ts --apply
cd apps/server && node --env-file-if-exists=.env --import tsx src/seed-boat-types.ts --apply
pnpm --filter @yacht-charter/db seed -- --faq-only
pnpm --filter @yacht-charter/db translations:apply -- --apply
pnpm --filter @yacht-charter/providers facets:backfill -- --apply
```

In production the same steps run through the built entry points (`seed:routes`, `seed:catalogue-routes`, `seed:boat-types`, `seed:facets`), and they are a deliberate manual step after the deploy.

Two things about the route seeds are worth knowing before you trust them:

- They never touch a route that already exists, because after the first run the routes belong to the editors. A language added later would therefore never reach any real database, which is why `fillMissingRouteTranslations` exists: it writes only the locales a route or stop has no row in, and leaves every existing row alone. Both seeds print what it filled.
- `seed -- --faq-only` does overwrite the site FAQ from the file. If an editor has reworded an answer in the admin, that wording is lost.

## Verifying coverage afterwards

```sql
select locale, count(*) from facet_media_translation group by 1 order by 1;
```

Locales the provider names land around 2,100 to 2,200; a generated locale lands near 1,500. A locale sitting at a couple of hundred means its generated file is missing or was never applied.

## Quality, which none of the above measures

Every check here is mechanical. They prove a translation will not crash and that no key is missing; they say nothing about whether it reads like the language.

So plan for a review pass that is separate from the translation pass: a fresh reader, reading the finished locale against the English and the glossary, asked for corrections rather than approval. The translation pass should hand it a list of what it was unsure about, which is far more useful than a general request to check everything.

And record the status honestly. `apps/web/AGENTS.md` marks the machine-translated locales as awaiting native review; a language that has been reviewed should stop being marked that way, and one that has not should keep the mark however good it looks.
