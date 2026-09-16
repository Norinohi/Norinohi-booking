import {
  discountCreateInputSchema,
  discountIdInputSchema,
  discountListInputSchema,
  discountListSchema,
  discountSchema,
  discountSetActiveInputSchema,
  discountUpdateInputSchema,
  yachtOptionsInputSchema,
  yachtOptionsSchema,
} from "../../contracts/admin";
import { adminProcedure } from "../../index";
import {
  createDiscount,
  getDiscount,
  listDiscounts,
  setDiscountActive,
  updateDiscount,
} from "../../services/discount-admin";
import { listYachtOptions } from "../../services/listing-options";
import { withJsonBodyExample } from "../openapi-examples";

export const discountAdminRouter = {
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
};
