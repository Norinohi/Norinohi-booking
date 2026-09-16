import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { env } from "@yacht-charter/env/server";
import { appRouter } from "@yacht-charter/api/routers/index";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { log, parseError, type ParsedError } from "evlog";

// oRPC handler config; index.ts owns the middleware order.

/*
 * A refused request (a 4xx the procedure meant to send) is a warning, so only a failure on our
 * side reaches the drain at error level.
 */
function reportHandlerError(handler: "openapi" | "rpc", thrown: ParsedError): void {
  const event = {
    action: "orpc.error",
    handler,
    status: thrown.status,
    code: thrown.code,
    ...thrownFields(thrown),
  };
  if (thrown.status >= 500) log.error(event);
  else log.warn(event);
}

const openApiServerUrl =
  env.OPENAPI_SERVER_URL ?? new URL("/api-reference", env.BETTER_AUTH_URL).toString();

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      docsProvider: "scalar",
      docsTitle: "YachtSkanner API Reference",
      specPath: "/openapi.json",
      specGenerateOptions: {
        servers: [{ url: openApiServerUrl }],
      },
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [onError((error) => reportHandlerError("openapi", parseError(error)))],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError((error) => reportHandlerError("rpc", parseError(error)))],
});
