import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { env } from "@yacht-charter/env/server";
import { appRouter } from "@yacht-charter/api/routers/index";

// oRPC handler config; index.ts owns the middleware order.

const openApiServerUrl =
  env.OPENAPI_SERVER_URL ?? new URL("/api-reference", env.BETTER_AUTH_URL).toString();

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      docsProvider: "scalar",
      docsTitle: "Yacht Charter API Reference",
      specPath: "/openapi.json",
      specGenerateOptions: {
        servers: [{ url: openApiServerUrl }],
      },
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});
