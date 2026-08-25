import { z } from "zod";

import {
  geographyOptionsInputSchema,
  geographyOptionsSchema,
  routeCreateInputSchema,
  routeIdInputSchema,
  routeListInputSchema,
  routeListSchema,
  routeSchema,
  routeSetActiveInputSchema,
  routeStopCreateInputSchema,
  routeStopIdInputSchema,
  routeStopReorderInputSchema,
  routeStopUpdateInputSchema,
  routeUpdateInputSchema,
} from "../contracts/route";
import { adminProcedure } from "../index";
import { listGeographyOptions } from "../services/geography-admin";
import {
  createRoute,
  createRouteStop,
  deleteRoute,
  deleteRouteStop,
  getRoute,
  listRoutes,
  reorderRouteStops,
  setRouteActive,
  updateRoute,
  updateRouteStop,
} from "../services/route-admin";
import { withJsonBodyExample } from "./openapi-examples";

const routeDeletedSchema = z.object({ id: z.string() });

/*
 * The authoring side of the suggested-route library. The read side is the listing detail page,
 * which picks one route per base and never sees a draft — so `active` is what separates a route
 * being written from one that is on the site, and every mutation here goes through `audit_log`.
 *
 * The stop procedures all answer with the whole route rather than the row they touched: the
 * editor draws the itinerary as a line, and a line is not something a single stop can describe.
 */
export const routeAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/list",
      operationId: "listSuggestedRoutes",
      summary: "List hand-authored suggested routes",
      description:
        "Every suggested route with its stops in order and the base or region it targets, drafts included. Filter by title, by kind, by the country the target sits in, and by whether the route is live. A route with no stops lists with an empty itinerary — that is what an unfinished one looks like.",
      tags: ["Admin"],
      successDescription: "A page of suggested routes.",
      spec: withJsonBodyExample({ page: 1, pageSize: 20 }),
    })
    .input(routeListInputSchema)
    .output(routeListSchema)
    .handler(({ context, input }) => listRoutes(context.db, input)),
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/get",
      operationId: "getSuggestedRoute",
      summary: "Get one suggested route",
      description: "A single route with its stops in `sort_order`, for the stop editor.",
      tags: ["Admin"],
      successDescription: "The requested route.",
      spec: withJsonBodyExample({ id: "srt_example" }),
    })
    .input(routeIdInputSchema)
    .output(routeSchema)
    .handler(({ context, input }) => getRoute(context.db, input.id)),
  create: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/create",
      operationId: "createSuggestedRoute",
      summary: "Create a suggested route",
      description:
        "Creates a route against exactly one target: baseId or regionId, never both and never neither. A base route wins over a region one on any listing homed there. New routes default to inactive, because a route is written stop by stop and a half-written itinerary must not reach the site. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The created route, with no stops yet.",
      spec: withJsonBodyExample({
        baseId: "base_example",
        title: "Split to Vis and back",
        kind: "seven_days",
        nights: 7,
      }),
    })
    .input(routeCreateInputSchema)
    .output(routeSchema)
    .handler(({ context, input }) => createRoute(context.db, context.session.user.id, input)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/update",
      operationId: "updateSuggestedRoute",
      summary: "Update a suggested route",
      description:
        "Updates the supplied fields. Naming either half of the target replaces the pair, so moving a route from a region to a base clears the region. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The updated route.",
      spec: withJsonBodyExample({ id: "srt_example", title: "Split to Vis and back", nights: 7 }),
    })
    .input(routeUpdateInputSchema)
    .output(routeSchema)
    .handler(({ context, input }) => updateRoute(context.db, context.session.user.id, input)),
  setActive: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/setActive",
      operationId: "setSuggestedRouteActive",
      summary: "Publish or unpublish a suggested route",
      description:
        "Flips the flag the listing page reads. Publishing a route with no stops is refused with CONFLICT: the section would render a title over an empty map. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The route with its new active state.",
      spec: withJsonBodyExample({ id: "srt_example", active: true }),
    })
    .input(routeSetActiveInputSchema)
    .output(routeSchema)
    .handler(({ context, input }) =>
      setRouteActive(context.db, context.session.user.id, input.id, input.active),
    ),
  delete: adminProcedure
    .route({
      method: "POST",
      path: "/admin/route/delete",
      operationId: "deleteSuggestedRoute",
      summary: "Delete a suggested route",
      description:
        "Removes the route and its stops. Nothing references a route, so there is no soft-delete to preserve — but unpublishing is the reversible choice and is what a route being reworked wants. Writes an audit log entry carrying the whole route as it was.",
      tags: ["Admin"],
      successDescription: "The id of the deleted route.",
      spec: withJsonBodyExample({ id: "srt_example" }),
    })
    .input(routeIdInputSchema)
    .output(routeDeletedSchema)
    .handler(({ context, input }) => deleteRoute(context.db, context.session.user.id, input.id)),
  stop: {
    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/route/stop/create",
        operationId: "createSuggestedRouteStop",
        summary: "Add a stop to a route",
        description:
          "Appends a stop at the end of the itinerary. lat and lng are required and are the whole point of the table: the section this feeds used to place every stop at the charter base plus a fixed offset. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The route with the new stop appended.",
        spec: withJsonBodyExample({
          routeId: "srt_example",
          name: "Vis",
          lat: 43.0619,
          lng: 16.1839,
        }),
      })
      .input(routeStopCreateInputSchema)
      .output(routeSchema)
      .handler(({ context, input }) => createRouteStop(context.db, context.session.user.id, input)),
    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/route/stop/update",
        operationId: "updateSuggestedRouteStop",
        summary: "Edit one stop",
        description:
          "Updates a stop's name, position or note. Position is changed through reorder, not here. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The route with the edited stop.",
        spec: withJsonBodyExample({ id: "srts_example", lat: 43.0619, lng: 16.1839 }),
      })
      .input(routeStopUpdateInputSchema)
      .output(routeSchema)
      .handler(({ context, input }) => updateRouteStop(context.db, context.session.user.id, input)),
    delete: adminProcedure
      .route({
        method: "POST",
        path: "/admin/route/stop/delete",
        operationId: "deleteSuggestedRouteStop",
        summary: "Remove one stop",
        description:
          "Deletes a stop and closes the gap it left in `sort_order`, so the next appended stop lands at the end rather than in the middle. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The route without that stop.",
        spec: withJsonBodyExample({ id: "srts_example" }),
      })
      .input(routeStopIdInputSchema)
      .output(routeSchema)
      .handler(({ context, input }) =>
        deleteRouteStop(context.db, context.session.user.id, input.id),
      ),
    reorder: adminProcedure
      .route({
        method: "POST",
        path: "/admin/route/stop/reorder",
        operationId: "reorderSuggestedRouteStops",
        summary: "Reorder a route's stops",
        description:
          "Rewrites `sort_order` from the submitted order, which is the order the days are numbered in on the site. Every stop on the route must appear exactly once; a partial list is refused with CONFLICT rather than leaving the rest on positions the moved ones now want. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The route with its stops renumbered.",
        spec: withJsonBodyExample({
          routeId: "srt_example",
          stopIds: ["srts_one", "srts_two", "srts_three"],
        }),
      })
      .input(routeStopReorderInputSchema)
      .output(routeSchema)
      .handler(({ context, input }) =>
        reorderRouteStops(context.db, context.session.user.id, input),
      ),
  },
};

export const geographyAdminRouter = {
  options: adminProcedure
    .route({
      method: "POST",
      path: "/admin/geography/options",
      operationId: "listGeographyOptions",
      summary: "List countries, regions and bases for a target picker",
      description:
        "The country → region → location → base hierarchy flattened into three lists. `base` has no country column — it reaches one through its location's region — so both the region and base lists are joins, and both are ordered by how many published listings sit behind them rather than alphabetically. Pass countryId to narrow, query to search a region, base or location name.",
      tags: ["Admin"],
      successDescription: "Geography options for the picker.",
      spec: withJsonBodyExample({ query: "Split", limit: 50 }),
    })
    .input(geographyOptionsInputSchema)
    .output(geographyOptionsSchema)
    .handler(({ context, input }) => listGeographyOptions(context.db, input)),
};
