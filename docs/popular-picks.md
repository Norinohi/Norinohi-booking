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

| Kind                                          | Pinned | Home page |
| --------------------------------------------- | ------ | --------- |
| Countries                                     | 8      | 12        |
| Boat types                                    | 7      | —         |
| Amenities                                     | 18     | —         |
| Sailing areas                                 | 12     | —         |
| Marinas                                       | 16     | —         |
| Models, locations, crew types, mainsail types | none   | —         |

Models and the rest are curatable and simply have nothing pinned yet.

## Deploying

Push, and the schema takes care of itself: `apps/server`'s pre-deploy step runs
`pnpm --filter server migrate`, which applies migrations `0107` and `0108`. Both are additive —
new nullable columns, one new table, one new enum value — so there is no downtime and no data to
lose. Deploy the server before the web app; the web app reads two new contract fields that the
old server does not send.

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

Everything below is already served. No backend work is needed except where this says so.

Run locally with three commands, in this order — the web build calls the API, so the server has
to be up first:

```bash
pnpm db:start
pnpm dev:server
pnpm dev:web
```

Then `pnpm --filter @yacht-charter/db seed -- --facets-only` once, to get the curated lists into
your local database.

Types flow from `AppRouterClient` with no codegen. Never hand-write a request or response type;
infer it, the way `apps/web/src/features/home/types.ts` already does.

### Popular destinations

No new endpoint. `charterSearch.facets` already carries what the cards need, and the home page
already fetches it through `useFilterOptions()`.

Take `options.countries`, keep the entries whose `featuredRank` is not null, sort by it ascending.
Twelve come back. Each option carries `label`, `count`, `imageUrl`, `cloudinaryId`,
`priceFromMinor` and `currency`, which is everything `popular-destinations.tsx` reads today — it
currently renders the same list alphabetically.

Slider shows the first six; the "View All Popular" grid shows all twelve in three columns by four
rows.

`partitionByPopularity` in `@/components/shared/form/filters` does the popular/rest split for
`popularRank`. It does **not** handle `featuredRank`; the home page sorts on that itself.

### Popular sailing routes

`charterSearch.popularRoutes({ locale, limit })`. Replaces the hard-coded `ROUTES` array in
`sailing-routes.tsx`.

Each route carries `title`, `description`, `nights`, `difficulty` (`easy` / `moderate` /
`advanced`, or null), `imageUrl`, `cloudinaryId`, `placeLabel` ("Dalmatia · Croatia"),
`countryValue` for building the card's search link, and `stops` with coordinates.

Copy comes back in the requested language, falling back to the route's own text where that
language has none. Only published routes are returned. Staff author them on `/routes`, including
the four-locale panes and the featured order.

The three routes on the page today are hard-coded with local images and translated through
message files. Moving to this endpoint means their copy moves into the database, so somebody has
to author them on `/routes` first or the slider comes back empty.

### Popular yachts

`charterSearch.popularYachts({ locale, currency, seed })`.

Returns `items` as ordinary listing summaries — the same shape `popular-yachts.tsx` already
renders — plus the `config` the selection was made under.

Composition is edited on `/settings`: how many boats, maximum age, maximum per country, maximum
per base, and the per-type mix. Only the curated popular countries are drawn from.

**The mix is a target, not a guarantee.** When the caps starve a type, the remaining places go to
the next best boats rather than leaving the slider short. Do not assume exactly three catamarans.

Leave `seed` off. The server buckets the clock by the day, so the selection rotates daily and is
stable inside a cache window. Passing an unstable value would break the prerender — see the
comment in `prefetchHome`.

### Amenity chips on a yacht card

This one needs a small backend change first, so read before starting.

The four chips should be the boat's best amenities by curated priority, not the first four it
happens to list. The ranks exist: `options.equipment` from the facets read carries `popularRank`,
and `topAmenities` in `packages/db/src/search/amenity-priority.ts` does the ordering.

`apps/web` cannot import that helper — it does not depend on `@yacht-charter/db` and should not
start. Two ways forward, and the first is better:

1. **Apply it server-side** in `presentListingSummary` (`packages/api/src/presenters/listing.ts`),
   so every card and every consumer gets the same four. One backend change, nothing for the web
   app to do.
2. Sort client-side in `apps/web/src/lib/boat-card-fields.ts` against the ranks from the equipment
   facet. Works, but every surface that shows a card has to remember to do it.

`boat-card-fields.ts` currently takes the first three (`AMENITY_LIMIT = 3`); the client asked for
four.

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
