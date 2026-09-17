import {
  listingAdminListInputSchema,
  listingAdminListSchema,
  listingFieldSourcesInputSchema,
  listingFieldSourcesSchema,
  listingPriceClearInputSchema,
  listingPriceFiltersSchema,
  listingPriceGetInputSchema,
  listingPriceListInputSchema,
  listingPriceListSchema,
  listingPriceRowSchema,
  listingPriceUpdateInputSchema,
  listingPublishDraftsInputSchema,
  listingPublishDraftsSchema,
  listingSetStatusInputSchema,
  listingSetStatusSchema,
  setListingFieldSourceInputSchema,
} from "../../contracts/admin";
import { emptyInputSchema } from "../../contracts/primitives";
import { adminProcedure } from "../../index";
import {
  listAdminListings,
  listListingFieldSources,
  publishListingDrafts,
  setListingFieldSource,
  setListingStatus,
} from "../../services/listing-admin";
import {
  clearListingPrice,
  getListingPrice,
  listListingPriceFilters,
  listListingPrices,
  updateListingPrice,
} from "../../services/listing-price";
import { withJsonBodyExample } from "../openapi-examples";

export const listingAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing/list",
      operationId: "listAdminListings",
      summary: "List the catalogue including unpublished listings",
      description:
        "Every listing staff can act on, newest first, drafts included. Filter by provider, by status, and by a case-insensitive substring of the title or slug. Rows carry the operator, model, year, base and location, the primary image, and the cheapest available price when availability has been synced. Public search shows published listings only, so this is the only place an imported draft is visible.",
      tags: ["Admin"],
      successDescription: "A page of listings.",
      spec: withJsonBodyExample({
        provider: "booking_manager",
        status: "draft",
        page: 1,
        pageSize: 20,
      }),
    })
    .input(listingAdminListInputSchema)
    .output(listingAdminListSchema)
    .handler(({ context, input }) => listAdminListings(context.db, input)),
  setStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing/setStatus",
      operationId: "setListingStatus",
      summary: "Publish, hide or unpublish one listing",
      description:
        "Moves a single listing between draft, published and hidden, and rebuilds its search document so the change shows up in search immediately: publishing writes the document, draft and hidden remove it. Writes an audit log entry carrying the status before and after.",
      tags: ["Admin"],
      successDescription: "The listing with its new status.",
      spec: withJsonBodyExample({
        id: "ylst_yacht-sunreef-60-celeste",
        status: "published",
      }),
    })
    .input(listingSetStatusInputSchema)
    .output(listingSetStatusSchema)
    .handler(({ context, input }) => setListingStatus(context.db, context.session.user.id, input)),
  fieldSources: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing/fieldSources",
      operationId: "listListingFieldSources",
      summary: "Which vendor each part of a merged listing comes from",
      description:
        "Every provider offer on this listing, with its own reading of the boat, and which one currently supplies each field group. The resolver picks on its own — a locked override first, then the stated rule for media, then whichever record says more, then the provider preference — and writes its choice back, so this shows the decision rather than re-deriving it. A `locked` row is a person's decision and the nightly resolver leaves it alone; everything else is rewritten on every run. Only interesting on a listing several vendors sell, since a single-offer listing has one candidate per group.",
      tags: ["Admin"],
      successDescription: "The offers and the current field decisions.",
      spec: withJsonBodyExample({ listingId: "ylst_yacht-lagoon-42-aurora" }),
    })
    .input(listingFieldSourcesInputSchema)
    .output(listingFieldSourcesSchema)
    .handler(({ context, input }) => listListingFieldSources(context.db, input)),
  setFieldSource: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing/setFieldSource",
      operationId: "setListingFieldSource",
      summary: "Pin one field group to one provider, or release it",
      description:
        "Locks a field group to the named offer, which is the one thing the nightly resolver will not overwrite: this is how staff say the photographs come from Booking Manager whatever the counts say. Passing a null offer releases the group back to the resolver, so it is recomputed on every run again. The listing is composed again and its search document rebuilt straight away, because an override nobody can see the effect of is indistinguishable from one that did not work. Rejects an offer belonging to another listing. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The field decisions after the change.",
      spec: withJsonBodyExample({
        listingId: "ylst_yacht-lagoon-42-aurora",
        field: "media",
        listingOfferId: "loff_example",
      }),
    })
    .input(setListingFieldSourceInputSchema)
    .output(listingFieldSourcesSchema)
    .handler(({ context, input }) =>
      setListingFieldSource(context.db, context.session.user.id, input),
    ),
  publishDrafts: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing/publishDrafts",
      operationId: "publishListingDrafts",
      summary: "Publish a provider's imported drafts in bulk",
      description:
        "Publishes every listing still sitting at draft within the given scope and rebuilds their search documents. provider is that scope, NOT a filter on the response: naming a provider releases only its drafts, while OMITTING provider PUBLISHES EVERY PROVIDER'S DRAFTS IN THE ENTIRE CATALOGUE IN ONE CALL. Syncs import as draft so unreviewed vendor inventory never reaches customers; an unscoped call undoes that everywhere at once, which in production is thousands of unreviewed yachts. Pass a provider unless releasing the whole catalogue is exactly what is meant. Writes one audit log entry recording the scope and the count.",
      tags: ["Admin"],
      successDescription: "How many drafts were published.",
      spec: withJsonBodyExample({ provider: "booking_manager" }),
    })
    .input(listingPublishDraftsInputSchema)
    .output(listingPublishDraftsSchema)
    .handler(({ context, input }) =>
      publishListingDrafts(context.db, context.session.user.id, input),
    ),
};

export const listingPriceAdminRouter = {
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing-price/get",
      operationId: "getListingPrice",
      summary: "Get one listing's base and current price",
      description:
        "The single row behind the Edit Price dialog: the provider's recommended price, the price after the active manual override, and the rule responsible for the difference. Addressed by id rather than found inside a `list` page, which is capped at 100 rows and so could not reach a large catalogue's tail.",
      tags: ["Admin"],
      successDescription: "The listing's prices.",
      spec: withJsonBodyExample({ listingId: "ylst_yacht-lagoon-42-aurora" }),
    })
    .input(listingPriceGetInputSchema)
    .output(listingPriceRowSchema)
    .handler(({ context, input }) => getListingPrice(context.db, input.listingId)),
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing-price/list",
      operationId: "listListingPrices",
      summary: "List listing base and current prices",
      description:
        "Returns one row per listing for the Manage Prices table: the provider's recommended price alongside the price after the active manual override, plus the rule responsible for the difference.",
      tags: ["Admin"],
      successDescription: "A page of listing prices.",
      spec: withJsonBodyExample({ query: "Bavaria", page: 1, pageSize: 10 }),
    })
    .input(listingPriceListInputSchema)
    .output(listingPriceListSchema)
    .handler(({ context, input }) => listListingPrices(context.db, input)),
  filters: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing-price/filters",
      operationId: "listListingPriceFilters",
      summary: "List Manage Prices filter options",
      description:
        "Returns the yacht categories and locations present in the catalogue, for the 'All types' and 'All locations' dropdowns.",
      tags: ["Admin"],
      successDescription: "Filter options for the Manage Prices table.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(listingPriceFiltersSchema)
    .handler(({ context }) => listListingPriceFilters(context.db)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing-price/update",
      operationId: "updateListingPrice",
      summary: "Override a listing's price",
      description:
        "Sets an absolute price for one listing by creating a non-stackable, listing-scoped price adjustment rule and deactivating any previous manual override. startsAt and endsAt scope the override to part of the season; omit both for an open-ended override. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The listing row with its new current price.",
      spec: withJsonBodyExample({
        listingId: "ylst_yacht-sunreef-60-celeste",
        newPriceMinor: 1_159_900,
        currency: "EUR",
        startsAt: "2026-07-01",
        endsAt: "2026-08-31",
      }),
    })
    .input(listingPriceUpdateInputSchema)
    .output(listingPriceRowSchema)
    .handler(({ context, input }) =>
      updateListingPrice(context.db, context.session.user.id, input),
    ),
  clear: adminProcedure
    .route({
      method: "POST",
      path: "/admin/listing-price/clear",
      operationId: "clearListingPrice",
      summary: "Remove a listing's price override",
      description:
        "Deactivates the manual override for one listing so it falls back to the provider's recommended price. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The listing row back at its provider price.",
      spec: withJsonBodyExample({ listingId: "ylst_yacht-sunreef-60-celeste" }),
    })
    .input(listingPriceClearInputSchema)
    .output(listingPriceRowSchema)
    .handler(({ context, input }) =>
      clearListingPrice(context.db, context.session.user.id, input.listingId),
    ),
};
