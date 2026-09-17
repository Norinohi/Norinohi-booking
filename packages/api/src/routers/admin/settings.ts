import { DEFAULT_TRANSACTING_PREFERENCE } from "@yacht-charter/env/providers";

import {
  marketplaceSettingsSchema,
  marketplaceSettingsUpdateInputSchema,
} from "../../contracts/admin";
import { emptyInputSchema } from "../../contracts/primitives";
import { adminProcedure } from "../../index";
import {
  getMarketplaceSettings,
  updateMarketplaceSettings,
} from "../../services/marketplace-settings";
import { withJsonBodyExample } from "../openapi-examples";

export const settingsAdminRouter = {
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/settings/get",
      operationId: "getMarketplaceSettings",
      summary: "Read the marketplace-wide settings",
      description:
        "The payment flow in force for every quote: whether we follow the provider's own instalment plan or our own percentage, and whether a charter starting soon is forced to full prepayment. A database that has never been configured answers with the defaults rather than an error.",
      tags: ["Admin"],
      successDescription: "The current settings.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(marketplaceSettingsSchema)
    .handler(({ context }) => getMarketplaceSettings(context.db)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/settings/update",
      operationId: "updateMarketplaceSettings",
      summary: "Change the marketplace-wide settings",
      description:
        "Saves the payment flow, the provider preference and which figure the offer ranking compares. All take effect on the next quote, not on quotes already issued: a quote the customer is holding keeps the policy it was priced under. The preference also orders the catalogue cards, and that part only moves when the search documents are next rebuilt.",
      tags: ["Admin"],
      successDescription: "The saved settings.",
      spec: withJsonBodyExample({
        payment: {
          source: "marketplace",
          mode: "deposit",
          depositPct: 0.5,
          enforceLeadTime: true,
          leadTimeDays: 60,
        },
        transactingPreference: [...DEFAULT_TRANSACTING_PREFERENCE],
        offerRankingUsesBasePrice: false,
        catalogueShowsBasePrice: false,
        offerRankingUsesReliability: false,
        reliabilityWindowDays: 30,
        displayCurrencyEnabled: false,
        displayCurrencyDefault: "EUR",
        displayCurrencyByCountry: {},
        nameSearchEnabled: false,
      }),
    })
    .input(marketplaceSettingsUpdateInputSchema)
    .output(marketplaceSettingsSchema)
    .handler(({ context, input }) =>
      updateMarketplaceSettings(context.db, {
        payment: input.payment,
        transactingPreference: input.transactingPreference,
        offerRankingUsesBasePrice: input.offerRankingUsesBasePrice,
        catalogueShowsBasePrice: input.catalogueShowsBasePrice,
        offerRankingUsesReliability: input.offerRankingUsesReliability,
        reliabilityWindowDays: input.reliabilityWindowDays,
        displayCurrencyEnabled: input.displayCurrencyEnabled,
        displayCurrencyDefault: input.displayCurrencyDefault,
        displayCurrencyByCountry: input.displayCurrencyByCountry,
        nameSearchEnabled: input.nameSearchEnabled,
        actorUserId: context.session.user.id,
      }),
    ),
};
