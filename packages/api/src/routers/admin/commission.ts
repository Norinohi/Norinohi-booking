import {
  commissionCreateInputSchema,
  commissionIdInputSchema,
  commissionListInputSchema,
  commissionListSchema,
  commissionSchema,
  commissionSetActiveInputSchema,
  commissionUpdateInputSchema,
  operatorOptionsInputSchema,
  operatorOptionsSchema,
} from "../../contracts/admin";
import { adminProcedure } from "../../index";
import {
  createCommission,
  getCommission,
  listCommissions,
  listOperatorOptions,
  setCommissionActive,
  updateCommission,
} from "../../services/commission-admin";
import { withJsonBodyExample } from "../openapi-examples";

/*
 * Commission rates, shipped empty. Nothing in the sale reads them yet: the agreed ranking
 * uses commission only to separate two offers already equal on price and obligatory extras,
 * so an empty table is that step switched off and entering rates is what turns it on.
 */
export const commissionAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/list",
      operationId: "listCommissions",
      summary: "List commission rates",
      description:
        "Every rate CharterNavi has negotiated, newest first, optionally narrowed to one provider or one status. Status is derived from the active flag and the validity window rather than stored, so a rate whose window closed reads as expired without anyone editing it.",
      tags: ["Admin"],
      successDescription: "A page of rates with their provider, operator and derived status.",
      spec: withJsonBodyExample({ page: 1, pageSize: 20 }),
    })
    .input(commissionListInputSchema)
    .output(commissionListSchema)
    .handler(({ context, input }) => listCommissions(context.db, input)),
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/get",
      operationId: "getCommission",
      summary: "Get one commission rate",
      description: "One rate by id, in the same shape the list returns.",
      tags: ["Admin"],
      successDescription: "The rate, or NOT_FOUND.",
      spec: withJsonBodyExample({ id: "pcm_example" }),
    })
    .input(commissionIdInputSchema)
    .output(commissionSchema)
    .handler(({ context, input }) => getCommission(context.db, input.id)),
  create: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/create",
      operationId: "createCommission",
      summary: "Add a commission rate",
      description:
        "Records what we earn through one provider, optionally for one operator only. A rate with no operator covers every operator at that vendor. Refused with CONFLICT when an active rate already covers the same provider, operator and days: overlapping windows are not something the database can refuse cheaply, and two answers to the same question is the one case worth stopping at entry.",
      tags: ["Admin"],
      successDescription: "The rate as stored.",
      spec: withJsonBodyExample({ provider: "nausys", ratePct: 15, startsAt: "2026-01-01" }),
    })
    .input(commissionCreateInputSchema)
    .output(commissionSchema)
    .handler(({ context, input }) => createCommission(context.db, context.session.user.id, input)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/update",
      operationId: "updateCommission",
      summary: "Edit a commission rate",
      description:
        "Changes the fields named and leaves the rest. The previous values are written to the audit log, because a rate is a commercial agreement and when it changed matters as much as what it says.",
      tags: ["Admin"],
      successDescription: "The rate after the edit.",
      spec: withJsonBodyExample({ id: "pcm_example", ratePct: 17.5 }),
    })
    .input(commissionUpdateInputSchema)
    .output(commissionSchema)
    .handler(({ context, input }) => updateCommission(context.db, context.session.user.id, input)),
  setActive: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/setActive",
      operationId: "setCommissionActive",
      summary: "Switch a commission rate on or off",
      description:
        "Switching off keeps the row: a lapsed agreement stays readable, and the audit trail keeps its history. An inactive rate is invisible to the ranking.",
      tags: ["Admin"],
      successDescription: "The rate after the change.",
      spec: withJsonBodyExample({ id: "pcm_example", active: false }),
    })
    .input(commissionSetActiveInputSchema)
    .output(commissionSchema)
    .handler(({ context, input }) =>
      setCommissionActive(context.db, context.session.user.id, input.id, input.active),
    ),
  operatorOptions: adminProcedure
    .route({
      method: "POST",
      path: "/admin/commission/operatorOptions",
      operationId: "listCommissionOperatorOptions",
      summary: "Search operators for the rate form",
      description:
        "Backs the operator picker. A search rather than a listing: the catalogue carries thousands of charter companies, so only the first matches are returned.",
      tags: ["Admin"],
      successDescription: "Up to twenty operators matching the query, by name.",
      spec: withJsonBodyExample({ query: "istion" }),
    })
    .input(operatorOptionsInputSchema)
    .output(operatorOptionsSchema)
    .handler(({ context, input }) => listOperatorOptions(context.db, input)),
};
