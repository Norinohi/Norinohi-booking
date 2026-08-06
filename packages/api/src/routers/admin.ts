import { createInventoryProvider, providerCapabilitiesSchema } from "@yacht-charter/providers";
import { z } from "zod";

import {
  discountCreateInputSchema,
  discountIdInputSchema,
  discountListInputSchema,
  discountListSchema,
  discountSchema,
  discountSetActiveInputSchema,
  discountUpdateInputSchema,
  listingPriceClearInputSchema,
  listingPriceFiltersSchema,
  listingPriceListInputSchema,
  listingPriceListSchema,
  listingPriceRowSchema,
  listingPriceUpdateInputSchema,
  yachtOptionsInputSchema,
  yachtOptionsSchema,
} from "../contracts/admin";
import { adminProcedure } from "../index";
import {
  createDiscount,
  getDiscount,
  listDiscounts,
  listYachtOptions,
  setDiscountActive,
  updateDiscount,
} from "../services/discount";
import {
  clearListingPrice,
  listListingPriceFilters,
  listListingPrices,
  updateListingPrice,
} from "../services/listing-price";
import { withJsonBodyExample } from "./openapi-examples";

const provider = createInventoryProvider();
const emptyInputSchema = z.object({}).default({});

export const adminRouter = {
  provider: {
    capabilities: adminProcedure
      .route({
        method: "POST",
        path: "/admin/provider/capabilities",
        operationId: "getProviderCapabilities",
        summary: "Get active provider capabilities",
        description:
          "Returns the active inventory provider's supported booking and quote capabilities. Requires an authenticated admin user.",
        tags: ["Admin"],
        successDescription: "Capabilities for the currently configured inventory provider.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(providerCapabilitiesSchema)
      .handler(() => provider.capabilities()),
  },
  discount: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/list",
        operationId: "listDiscounts",
        summary: "List promo codes",
        description:
          "Returns promo codes for the staff Discount Manager, newest first, with the derived status (active, scheduled, expired, inactive), the redemption count against the usage limit, and a rendered 'Applies to' label.",
        tags: ["Admin"],
        successDescription: "A page of promo codes.",
        spec: withJsonBodyExample({ page: 1, pageSize: 10 }),
      })
      .input(discountListInputSchema)
      .output(discountListSchema)
      .handler(({ context, input }) => listDiscounts(context.db, input)),
    get: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/get",
        operationId: "getDiscount",
        summary: "Get one promo code",
        description: "Returns a single promo code with its targets, for the edit modal.",
        tags: ["Admin"],
        successDescription: "The requested promo code.",
        spec: withJsonBodyExample({ id: "dsc_example" }),
      })
      .input(discountIdInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => getDiscount(context.db, input.id)),
    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/create",
        operationId: "createDiscount",
        summary: "Create a promo code",
        description:
          "Creates a promo code and its targets. A percentage discount requires valuePct; a fixed discount requires valueMinor and currency. Codes are stored upper-cased and must be unique. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The created promo code.",
        spec: withJsonBodyExample({
          name: "Summer View 2026",
          code: "SUMMER2026",
          type: "percentage",
          valuePct: 10,
          startsAt: "2026-07-07",
          endsAt: "2026-07-30",
          usageLimit: 100,
          targets: [{ targetType: "all" }],
        }),
      })
      .input(discountCreateInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => createDiscount(context.db, context.session.user.id, input)),
    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/update",
        operationId: "updateDiscount",
        summary: "Update a promo code",
        description:
          "Updates the supplied fields of a promo code. Targets, when present, replace the existing set wholesale. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The updated promo code.",
        spec: withJsonBodyExample({
          id: "dsc_example",
          name: "Summer View 2026",
          valuePct: 25,
        }),
      })
      .input(discountUpdateInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => updateDiscount(context.db, context.session.user.id, input)),
    setActive: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/setActive",
        operationId: "setDiscountActive",
        summary: "Activate or deactivate a promo code",
        description:
          "Flips a promo code's active flag. Deactivating is preferred over deleting so existing redemptions keep their reference. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The promo code with its new active state.",
        spec: withJsonBodyExample({ id: "dsc_example", active: false }),
      })
      .input(discountSetActiveInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) =>
        setDiscountActive(context.db, context.session.user.id, input.id, input.active),
      ),
    yachtOptions: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/yachtOptions",
        operationId: "listDiscountYachtOptions",
        summary: "Search yachts for discount targeting",
        description:
          "Returns listings matching a name search, for the 'Specific Yachts' picker in the create/edit modal.",
        tags: ["Admin"],
        successDescription: "Matching listings.",
        spec: withJsonBodyExample({ query: "Bavaria", limit: 20 }),
      })
      .input(yachtOptionsInputSchema)
      .output(yachtOptionsSchema)
      .handler(({ context, input }) => listYachtOptions(context.db, input)),
  },
  listingPrice: {
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
  },
};
