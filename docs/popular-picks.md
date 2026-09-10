# Popular picks

Curated ordering for search facets, the home page and the popular-yachts slider. Staff edit it on
`/popular` under Website Content; nothing here needs a release.

## What is curated

Two independent ranks on `facet_media`, per facet value:

| Column          | Means                                                         | Read by                    |
| --------------- | ------------------------------------------------------------- | -------------------------- |
| `popular_rank`  | Pin the value into the "Popular" group at the top of a picker | Search filters, search bar |
| `featured_rank` | Order the home page's sliders and grids                       | Home page (not wired yet)  |

They are separate because the client's two country lists are not prefixes of each other: the
filter pins eight countries, the home page runs to twelve and takes France and the Caribbean at
seven and eight.

Seeded out of the box, from `packages/db/src/seed.ts`:

| Kind                                          | Pinned in filters | Ordered on home page |
| --------------------------------------------- | ----------------- | -------------------- |
| Countries                                     | 8                 | 12                   |
| Boat types                                    | 7                 | 7                    |
| Amenities                                     | 18                | —                    |
| Sailing areas                                 | 12                | —                    |
| Marinas                                       | 16                | —                    |
| Models, locations, crew types, mainsail types | none              | —                    |

Countries and boat types are the only kinds with a home page section of their own, so they are
the only ones carrying a featured rank. The rest are pinned in the filters only — a featured rank
on a kind nothing renders would read as curation that has stopped working. Add one the day such a
section exists; the admin screen already offers it.

Models and the remaining kinds are curatable and simply have nothing pinned yet.

## Deploying

Push, and the schema takes care of itself: `apps/server`'s pre-deploy step runs
`pnpm --filter server migrate`, which applies migrations `0107` and `0108`. Both are additive —
new nullable columns, one new table, one new enum value — so there is no downtime and no data to
lose.

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

Nothing else to run. The popular-yachts and popular-routes procedures ship live but unused, so
they cost nothing until the home page calls them.

**Rolling back** the application is safe without touching the database, since both migrations
only add.

## Wiring the home page

Five jobs. Four need no backend work; the fifth is called out.

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

### 1. Popular Destinations — `components/popular-destinations.tsx`

No new endpoint and no new fetch. The component already reads `useFilterOptions()`, and the
countries it lists now carry the curated order.

- [ ] Filter `options.countries` to entries whose `featuredRank` is not null, sort ascending.
      Twelve come back.
- [ ] Slider renders the first six. Today it renders every country, alphabetically.
- [ ] Change the "See All Destinations" button to "View All Popular" and point it at a grid of
      all twelve, three columns by four rows.
- [ ] Card price reads `from $$$ per person/week`. `priceFromMinor` and `currency` are on the
      option already; per-person is a division the card does, not a field.

Each option carries `label`, `count`, `imageUrl`, `cloudinaryId`, `priceFromMinor`, `currency` —
everything the card reads today.

`partitionByPopularity` in `@/components/shared/form/filters` splits on `popularRank`, not
`featuredRank`. Do not reach for it here; sort inline.

### 2. Boat Types — `components/boat-types.tsx`

Same shape as the destinations job, one line of work.

- [ ] Sort `options.boatTypes` by `featuredRank`, dropping the entries without one. Seven come
      back, in the client's order.
- [ ] The slider renders every boat type alphabetically today, so Jet Ski and Motorsailer sit
      among the ones that sell.

The "luxury" card beside them is editorial and not a facet — leave it where it is.

### 3. Popular Sailing Routes — `components/sailing-routes.tsx`

Replaces the hard-coded `ROUTES` array outright.

- [ ] Add `charterSearch.popularRoutes({ locale, limit })` to `features/home/api/queries.ts` as a
      query-options factory, and prefetch it in `api/server.ts` beside the other two.
- [ ] Pin the client `staleTime` to the server tier you cache it on, or every visitor refetches
      on hydration. The comment in `prefetchHome` explains why.
- [ ] Slider shows six, then a "View All Popular" grid of twelve, three by four.
- [ ] Card shows country on the image, direction and description below it.
- [ ] Drop the local `/assets/home/sailing-routes/*.webp` imports — `imageUrl` and `cloudinaryId`
      come from the route.

Each route carries `title`, `description`, `nights`, `difficulty` (`easy` / `moderate` /
`advanced`, or null), `imageUrl`, `cloudinaryId`, `placeLabel` ("Dalmatia · Croatia"),
`countryValue` for the card's search link, and `stops` with coordinates for the detail map.

**Blocked until someone authors the routes.** Only published, featured routes come back, and
today the database has one. The three on the page are hard-coded and translated through message
files, so moving to this endpoint moves their copy into the database. Staff write them on
`/routes`, including the four-locale panes and the featured order. Until then the slider is
empty, which is correct behaviour rather than a bug in your wiring.

### 4. Popular Yachts — `components/popular-yachts.tsx`

Currently `charterSearch.results` with `sort: "rating", pageSize: 5`. Swap the endpoint.

- [ ] Replace `popularYachtsQueryOptions` in `features/home/api/queries.ts` with
      `charterSearch.popularYachts({ locale, currency })`.
- [ ] Update `getPopularYachts()` in `api/server.ts` to match, keeping the `hours` tier and the
      `staleTime` pinned to it.
- [ ] Render twelve instead of five. `items` are ordinary listing summaries — the same shape the
      card takes today, so the card itself does not change.

Two traps.

**Leave `seed` off.** The server buckets the clock by the day, so the slider rotates daily and is
stable inside a cache window. Passing your own unstable value fails the build with
`blocking-prerender-current-time`.

**The type mix is a target, not a guarantee.** When the per-country and per-base caps starve a
type, the free places go to the next best boats. Do not write a layout that assumes exactly three
catamarans. `config` comes back alongside `items` if you need to show what was asked for.

Composition is edited on `/settings` — count, maximum age, caps, and the per-type mix.

### 5. Amenity chips on a yacht card — needs backend work first

The four chips should be the boat's best amenities by curated priority rather than the first four
it happens to list. `boat-card-fields.ts` currently takes the first three (`AMENITY_LIMIT = 3`).

The ranks exist and the ordering function is written — `topAmenities` in
`packages/db/src/search/amenity-priority.ts` — but `apps/web` cannot import it. The web app does
not depend on `@yacht-charter/db` and should not start; it talks to the server over oRPC only.

- [ ] **Backend, preferred:** apply `topAmenities` in `presentListingSummary`
      (`packages/api/src/presenters/listing.ts`) so every card and every consumer gets the same
      four. Nothing changes in the web app afterwards except the limit.
- [ ] **Frontend fallback:** sort in `boat-card-fields.ts` against `popularRank` on
      `options.equipment` from the facets read. Works, but every surface showing a card has to
      remember to do it.

Either way, raise `AMENITY_LIMIT` to 4.

There is an open question from the client on this one: whether the preview should show _all_ of a
boat's main amenities rather than the top four. That is a design decision, not a technical limit —
the full ordered list is available either way.

## Where things live

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| Ranks            | `packages/db/src/schema/facet-media.ts`                               |
| Seed             | `packages/db/src/seed.ts` (`curatedFacetRanks`)                       |
| Facet read       | `decorateFacetOptions` in `packages/db/src/search/repository.ts`      |
| Slider selection | `packages/db/src/search/popular-yachts.ts`                            |
| Curated routes   | `packages/db/src/search/popular-routes.ts`                            |
| Admin contract   | `packages/api/src/contracts/popular-facets.ts`                        |
| Admin service    | `packages/api/src/services/popular-facets-admin.ts`                   |
| Admin screen     | `apps/web/src/features/admin/components/popular-facets-table.tsx`     |
| Slider config    | `popularYachtsConfig` on `marketplace_setting`, edited on `/settings` |

## Known issue

Some marinas reach the catalogue under two vendor spellings that the facet normalisation does not
merge — `Sukošan / D-Marin Dalmacija Marina` and `Sukosan, D-Marin Dalmacija Marina` differ by one
diacritic, and Lavrion arrives three ways. They are therefore separate facet options, and the
pinned one carries only part of that marina's fleet. The larger spelling is pinned. Reconciling
the spellings is a catalogue job and predates this feature.
