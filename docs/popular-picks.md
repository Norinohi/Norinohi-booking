# Popular picks

Curated ordering for search facets, the home page and the popular-yachts slider. Staff edit it on
`/popular` under Website Content; nothing here needs a release.

## What is curated

Three independent columns on `facet_media`, per facet value:

| Column           | Means                                                         | Read by                    |
| ---------------- | ------------------------------------------------------------- | -------------------------- |
| `popular_rank`   | Pin the value into the "Popular" group at the top of a picker | Search filters, search bar |
| `featured_rank`  | Order the home page's sliders and grids                       | Home page (not wired yet)  |
| `filter_visible` | Offer the value in the filter at all                          | Every search filter panel  |

They are separate because the client's two country lists are not prefixes of each other: the
filter pins eight countries, the home page runs to twelve and takes France and the Caribbean at
seven and eight.

The third is an allowlist rather than an order, and it is opt-in per kind: while no value of a
kind is marked, the filter offers every value the catalogue carries, which is what it did before
the column existed. Mark one and the kind is curated from then on.

Equipment is the kind that needs it. The two providers publish 844 amenity spellings between
them, so the amenities filter listed "Bilge pump handle" and "Black conus" beside air
conditioning; the seed marks the client's shortlist of 52 and the filter offers those.

The shortlist is written in Booking Manager's vocabulary, and NauSYS words a good deal of it
differently. Those pairs are joined one layer down, by `amenity.canonical_name`, so the option
"Bimini" answers for NauSYS's "Bimini top" as well: see **Amenity grouping** below. What that
layer deliberately does not join is entries naming a neighbouring thing, so a plain "Gangway"
still answers no option while "Hydraulic gangway" is on the list.

Seeded out of the box, from `packages/db/src/seed.ts`:

| Kind                                          | Pinned in filters | Ordered on home page |
| --------------------------------------------- | ----------------- | -------------------- |
| Countries                                     | 8                 | 12                   |
| Boat types                                    | 7                 | 7                    |
| Amenities                                     | 18                | —                    |
| Sailing areas                                 | 12                | —                    |
| Marinas                                       | 16                | —                    |
| Models, locations, crew types, mainsail types | none              | —                    |

Plus the equipment filter allowlist: 52 amenities, and no allowlist on any other kind.

Countries and boat types are the only kinds with a home page section of their own, so they are
the only ones carrying a featured rank. The rest are pinned in the filters only — a featured rank
on a kind nothing renders would read as curation that has stopped working. Add one the day such a
section exists; the admin screen already offers it.

Models and the remaining kinds are curatable and simply have nothing pinned yet.

## Amenity grouping

The other half of the equipment filter, and the reason its options count what they do.

The two providers keep separate amenity taxonomies. Roughly thirty entries name one fitting in
different words - "Bimini top" against "Bimini", "GPS chart plotter" against "Chart plotter",
"Bathing platform" against "Swimming platform" - and the facet fold reconciles spelling, not
wording, so each pair was two options with the fleet split between them. Air conditioning stood
as 4,002 boats beside 3,543 more of the same thing.

`amenity.canonical_name` carries the marketplace's word for a vendor row, exactly as
`builder.canonical_name` and `yacht_model.canonical_name` already do for brands and hulls. The
map is `AMENITY_GROUPS` in `packages/providers/src/shared/amenity-names.ts`, keyed by
`amenity.code` (`<provider>:<vendor id>`) because vendor display names get re-worded between
syncs while the ids do not. The catalogue sync writes the column on every run.

Both reads fold on `coalesce(canonical_name, name)`: the search documents, so the filter and its
counts see one option, and the yacht page's equipment list, so a hull both vendors sell does not
list "Bimini" above "Bimini top". The vendor's own wording stays in `amenity.name` and in the
searchable text, so someone typing what one vendor calls it still finds the boat.

What is left ungrouped matters as much. A "Gangway" is not a hydraulic one, a "Radar reflector"
is not radar, an "Ice box" is not an ice maker, a "Washing machine" is not a washer/dryer, and a
bare "Radio" is not a radio-CD player. Those boats answer no option rather than the wrong one.

After a deploy that edits the map, apply it without waiting for a full sync:

```bash
pnpm --filter server apply:amenity-names            # dry run
pnpm --filter server apply:amenity-names -- --apply
```

It writes the column, rebuilds the search documents of the listings it touched - about 7,400 for
the first run, eleven seconds locally - and revalidates the web app's cache. Removing an entry
from the map is as effective as adding one: a code the map no longer names goes back to naming
itself.

## Deploying

Push, and the schema takes care of itself: `apps/server`'s pre-deploy step runs
`pnpm --filter server migrate`, which applies migrations `0107`, `0108`, `0111` and `0112`. All
are additive: new nullable columns, one boolean defaulting to false, one new table, one new enum
value, so there is no downtime and no data to lose.

**Deploy order does not matter for this change.** The two new facet fields are optional in the
contract, and the web app already reads a missing rank as "not curated": the pickers render flat
until the server catches up, then the groups appear. Nothing errors and nothing needs a redeploy.

Railway deploys the two services in parallel and has no way to make one wait for the other, so
the repo handles the general case in `apps/web/scripts/check-api.mjs` instead. It probes the API
before `next build` and fails fast with an actionable message when the server is older than the
build. That matters when a change adds a procedure the catalog routes prerender against — which
this one does not.

Then, **once per environment**, bootstrap the curated lists from the deployed container:

```bash
pnpm --filter server seed:facets
```

Three things to know about that command.

**It is a bootstrap, not a sync.** It writes the ranks from `seed.ts` over whatever is there, so
running it a second time discards curation staff have done on the admin screen. Run it once when
an environment is first brought up, and never again — after that the admin screen is the source
of truth.

**Its pins are exact label spellings** taken from the local catalogue. If production's fleet
differs, a pin that matches nothing is not an error and not visible on the site; it shows on the
admin screen with a "No yachts" warning, which is the signal to repoint it.

**`REVALIDATE_SECRET` must be set on the server.** The facets read is cached for a day and the
client's staleTime matches, so an admin save that cannot reach the web app is live in the
database and invisible on the site until tomorrow. When the variable is missing the save still
succeeds and the screen says so — the toast reads "Saved, but the site's cached pages could not
be refreshed yet" rather than claiming success.

On an environment that is **already live**, run the allowlist on its own instead:

```bash
pnpm --filter server seed:equipment-filter
```

It writes `filter_visible` and nothing else, so it costs no curation. `seed:facets` would, which
is why the allowlist has an entry point of its own. It is idempotent both ways: it marks the
shortlist and unmarks anything else that was marked, so running it twice leaves the same list.

Nothing else to run. The popular-yachts and popular-routes procedures ship live but unused, so
they cost nothing until the home page calls them.

**Rolling back** the application is safe without touching the database, since both migrations
only add.

## Wiring the home page

Six jobs. The fifth is already built. The sixth touches two shared controls rather than the
home page alone; the rest are home-page components only.

### The endpoints

All public reads are on `charterSearch`. Call them through `orpc` from
`apps/web/src/utils/orpc.ts`; the REST paths are there for `/api-reference` and curl.

| Section                | Procedure                     | REST                                 | Input                           | Gives you                                                                                                                            |
| ---------------------- | ----------------------------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Popular Destinations   | `charterSearch.facets`        | `GET /charter-search/facets`         | the search filters, or `{}`     | `options.countries[]` with `featuredRank`, `popularRank`, `label`, `count`, `imageUrl`, `cloudinaryId`, `priceFromMinor`, `currency` |
| Popular Sailing Routes | `charterSearch.popularRoutes` | `GET /charter-search/popular-routes` | `{ locale?, limit? }`           | `routes[]`                                                                                                                           |
| Popular Yachts         | `charterSearch.popularYachts` | `GET /charter-search/popular-yachts` | `{ locale?, currency?, seed? }` | `items[]` listing summaries, plus `config`                                                                                           |
| Amenity chips          | `charterSearch.facets`        | `GET /charter-search/facets`         | as above                        | `options.equipment[]` with `popularRank`                                                                                             |

Nothing else is new. Boat types and the country pins come off the same `facets` payload the page
already fetches, under `popularRank`.

Try any of them without writing code:

```bash
curl -s "http://localhost:3000/api-reference/charter-search/popular-yachts" | jq '.items | length'
curl -s "http://localhost:3000/api-reference/charter-search/popular-routes?limit=6" | jq
```

The staff screens use two more, for reference rather than for wiring:
`admin.popularFacets.list` / `.set` behind `/popular`, and `admin.route.listFeatured` /
`.reorderFeatured` behind `/routes`.

### Run it locally first

```bash
pnpm db:start          # Postgres on 5434
pnpm dev:server        # API on :3000 — start before web, the build calls it
pnpm dev:web           # http://localhost:3001
```

Once, to get the curated lists into your database:

```bash
pnpm --filter @yacht-charter/db seed -- --facets-only
```

Check it worked at `/popular` (staff login needed): Countries should show 8 pinned, and switching
the second selector to "Home page" should show 12. If both are empty, the seed did not run.

Change a curated list there and the search filters change on reload — that is the loop you are
wiring the home page into.

Types come from `AppRouterClient` by inference. Never hand-write a request or response type.

### 1. Popular Destinations — done

`components/popular-destinations.tsx` sorts `options.countries` by `featuredRank`, dropping the
uncurated ones, and falls back to every country only when nothing is curated. The slider shows
the first six; "View All Popular" swaps it in place for a grid of the first twelve, three columns
by four rows on desktop.

The card reads `from $$$ per person/week` off `pricePerPersonWeekMinor`, a facet aggregate beside
`priceFromMinor`: each boat's price stretched to a week over the nights it covers, divided by its
`max_guests`, and the lowest of those. It is computed per boat rather than by dividing the
country's cheapest charter, which is usually a small boat's short stay.

`partitionByPopularity` in `@/components/shared/form/filters` splits on `popularRank`, not
`featuredRank`, so it is not used here.

### 2. Boat Types — `components/boat-types.tsx`

Same shape as the destinations job, one line of work.

- [ ] Sort `options.boatTypes` by `featuredRank`, dropping the entries without one. Seven come
      back, in the client's order.
- [ ] The slider renders every boat type alphabetically today, so Jet Ski and Motorsailer sit
      among the ones that sell.

The "luxury" card beside them is editorial and not a facet — leave it where it is.

### 3. Popular Sailing Routes — done, waiting on content

`components/sailing-routes.tsx` reads `charterSearch.popularRoutes({ locale, limit: 12 })`,
prefetched in `api/server.ts` on the `hours` tier. The slider shows the first six; "View All
Popular" swaps it for a grid of all twelve, three columns by four rows on desktop.

The card puts the country on the photo (`countryLabel`, translated) and the route's title and
description under it. It links to the catalogue filtered by country, length (`nights`) and either
the route's sailing area (`sailingAreaValue`, for a route drawn over a region) or its starting
marina (`marinaValue`, for a route from a base). A base's own region is not used: Booking Manager
files most of the Mediterranean as "Southern Europe", which is no sailing area at all.

Every route write on `/routes` drops the catalog cache, so a published or reordered route reaches
the home page on the next request.

Only published, featured routes come back. The client's list is eleven routes; staff author
them on `/routes`, including the four-locale copy, the stops and the featured order. A route
meant for a sailing-area link should target the region rather than a base.

### 4. Popular Yachts — done

`components/popular-yachts.tsx` reads `charterSearch.popularYachts({ locale })`, cached on the
`hours` tier with the client `staleTime` pinned to it. `items` are plain listing summaries, not the
`{ listing, checkIn, ... }` wrappers search returns.

**Leave `seed` off.** The server buckets the clock by the day, so the slider rotates daily and is
stable inside a cache window. Passing your own unstable value fails the build with
`blocking-prerender-current-time`.

**The type mix is a target, not a guarantee.** When the per-country and per-base caps starve a
type, the free places go to the next best boats. Do not write a layout that assumes exactly three
catamarans. `config` comes back alongside `items` if you need to show what was asked for.

**The client's figures give ten, not twelve.** Five countries at two boats each is ten, so the
slider shows ten until the country cap, the country list or the count changes.

Composition is edited on `/popular-yachts` under Website Content, through `admin.popularYachts.get` / `.update`: count, maximum age, caps, the per-type mix, and the
destinations, one country per line (`Croatia: Split / Trogir; Zadar / Sukošan`). A place's
spellings are separated by `/` and matched against the boat's marina, location, city and region,
and each place counts as one base. An empty destination list falls back to the countries pinned
on `/popular`.

### 5. Amenity chips on a yacht card — done

Built, not left for you. Noted here because it changes the card contract.

The card shows the four highest-priority amenities the boat has, then a `+N` that opens a
scrollable tooltip with the rest. The overflow is the rest of the _curated_ shortlist, not the
sixty-odd fittings a vendor publishes, which is what makes the count honest.

`listingSummarySchema` gained `highlightAmenities`: the curated amenities this boat has, already
in the editor's order and nothing else. Ordering happens server-side in `presentListingSummary`,
so every consumer gets the same four - search cards, the detail page's similar yachts, the
popular-yachts slider. Ordering it in the search SQL was the alternative and measured ~10ms per
twenty-row page on the hottest query in the app; reading the eighteen ranked values once per
request costs one indexed lookup instead.

A boat with no curated amenities falls back to its own first four, so a fresh database shows the
chips it always showed rather than none.

### 6. Hero search pickers — `components/hero.tsx`, plus two shared controls

The two pickers in the home page's search card: "Where to?" and the boat type. This is the one
the client's first screenshot is of — the country dropdown with «Популярні країни» at the top.

The data is already there. `options.countries` and `options.boatTypes` carry `popularRank` on the
same facets payload the hero already reads. What is missing is that neither control can render a
group yet.

The hero uses single-selects, not the multi-select the search page uses:

| Field     | Control            | File                                                        |
| --------- | ------------------ | ----------------------------------------------------------- |
| Where to? | `SearchableSelect` | `apps/web/src/components/shared/form/searchable-select.tsx` |
| Boat type | `Select`           | `packages/ui/src/components/form/select.tsx`                |

So it is three changes, in this order:

- [ ] Add an optional `groups` prop to `Select`. It renders `options.map()` straight into
      `SelectContent` today; base-ui ships `Select.Group` and `Select.GroupLabel` for this.
- [ ] Add the same to `SearchableSelect`. It wraps `Combobox` with object items, so it needs
      `Combobox.Group` with an `items` prop plus `Combobox.Collection`.
- [ ] Pass the groups in `hero.tsx` for the country and boat fields. Leave the crew field alone —
      three options do not need a heading.

`MultiSelect` in `packages/ui/src/components/form/multi-select.tsx` already does exactly this for
the combobox case; copy its shape. In both, `groups` must be opt-in and the flat path untouched,
or every other select in the app inherits a heading it never asked for.

Two things to keep consistent with the search page:

- Reuse `partitionByPopularity` from `@/components/shared/form/filters`. It is what decides the
  split, it sorts by rank, and it returns null when nothing is curated so the control falls back
  to a flat list.
- Reuse the existing labels — `Filters.groups.popularCountries` / `allCountries` and
  `Filters.groups.popularBoatTypes` / `allBoatTypes`. They are already translated in all four
  locales, and the Ukrainian boat-type pair is the client's own wording, «Популярні судна». Do not
  mint a second set under `Home.Hero`.

## Where things live

|                  |                                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| Ranks            | `packages/db/src/schema/facet-media.ts`                                     |
| Seed             | `packages/db/src/seed.ts` (`curatedFacetRanks`, `equipmentFilterAllowlist`) |
| Amenity grouping | `packages/providers/src/shared/amenity-names.ts`                            |
| Allowlist entry  | `apps/server/src/seed-equipment-filter.ts`                                  |
| Facet read       | `decorateFacetOptions` in `packages/db/src/search/repository.ts`            |
| Slider selection | `packages/db/src/search/popular-yachts.ts`                                  |
| Curated routes   | `packages/db/src/search/popular-routes.ts`                                  |
| Admin contract   | `packages/api/src/contracts/popular-facets.ts`                              |
| Admin service    | `packages/api/src/services/popular-facets-admin.ts`                         |
| Admin screen     | `apps/web/src/features/admin/components/popular-facets-table.tsx`           |
| Slider config    | `popularYachtsConfig` on `marketplace_setting`, edited on `/popular-yachts` |

## Known issue

Some marinas reach the catalogue under two vendor spellings that the facet normalisation does not
merge — `Sukošan / D-Marin Dalmacija Marina` and `Sukosan, D-Marin Dalmacija Marina` differ by one
diacritic, and Lavrion arrives three ways. They are therefore separate facet options, and the
pinned one carries only part of that marina's fleet. The larger spelling is pinned. Reconciling
the spellings is a catalogue job and predates this feature.
