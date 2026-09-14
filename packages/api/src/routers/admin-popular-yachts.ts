import { popularYachtsConfigSchema } from "../contracts/admin";
import { emptyInputSchema } from "../contracts/primitives";
import { popularYachtsConfigSavedSchema } from "../contracts/popular-yachts";
import { adminProcedure } from "../index";
import {
  DEFAULT_POPULAR_YACHTS,
  getPopularYachtsConfig,
  updatePopularYachtsConfig,
} from "../services/popular-yachts-settings";
import { withJsonBodyExample } from "./openapi-examples";

export const popularYachtsAdminRouter = {
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/popular-yachts/get",
      operationId: "getPopularYachtsConfig",
      summary: "Read how the popular-yachts slider is composed",
      description:
        "The count, maximum age, per-country and per-base caps, per-type mix and destinations the home page's popular-yachts slider is selected under. A database that has never been configured answers with the defaults.",
      tags: ["Admin"],
      successDescription: "The current configuration.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(popularYachtsConfigSchema)
    .handler(({ context }) => getPopularYachtsConfig(context.db)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/popular-yachts/update",
      operationId: "updatePopularYachtsConfig",
      summary: "Change how the popular-yachts slider is composed",
      description:
        "Replaces the slider's configuration, leaving the rest of the marketplace settings untouched. Writes an audit log entry with the old and new configuration, then asks the web app to drop its cached catalog reads and reports whether it could: the home page read is cached for hours, so a save that could not reach the web app is live in the database but not yet on the site.",
      tags: ["Admin"],
      successDescription: "The saved configuration, and what the cache drop did.",
      spec: withJsonBodyExample(DEFAULT_POPULAR_YACHTS),
    })
    .input(popularYachtsConfigSchema)
    .output(popularYachtsConfigSavedSchema)
    .handler(({ context, input }) =>
      updatePopularYachtsConfig(context.db, context.session.user.id, input),
    ),
};
