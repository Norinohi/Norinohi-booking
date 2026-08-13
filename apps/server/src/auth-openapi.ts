import { z } from "zod";

import type { auth as authInstance } from "@yacht-charter/auth";

/*
 * better-auth types its generated document for reading, not for the example
 * injection below: its media-type object carries a schema and nothing else.
 * Re-reading the document through these loose schemas keeps every key the
 * generator emitted, while giving the parts we touch a shape we may extend.
 */
const openApiMediaTypeSchema = z.looseObject({});

const openApiOperationSchema = z.looseObject({
  parameters: z.array(z.looseObject({ name: z.string().optional() })).optional(),
  requestBody: z
    .looseObject({ content: z.record(z.string(), openApiMediaTypeSchema).optional() })
    .optional(),
});

const openApiDocumentSchema = z.looseObject({
  paths: z.record(z.string(), z.record(z.string(), openApiOperationSchema.optional())).optional(),
});

type OpenApiOperation = z.infer<typeof openApiOperationSchema>;

/** A request body or query-parameter example, as it is serialised into the document. */
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const authBodyExamples = new Map<string, JsonObject>([
  [
    "POST /sign-up/email",
    {
      name: "Demo Customer",
      email: "demo.customer@example.com",
      password: "Passw0rd!123",
      callbackURL: "http://localhost:3001/auth/verify-email",
      rememberMe: true,
    },
  ],
  [
    "POST /sign-in/email",
    {
      email: "demo.customer@example.com",
      password: "Passw0rd!123",
      rememberMe: true,
    },
  ],
  ["POST /sign-out", {}],
  [
    "POST /request-password-reset",
    {
      email: "demo.customer@example.com",
      redirectTo: "http://localhost:3001/auth/reset-password",
    },
  ],
  [
    "POST /reset-password",
    {
      newPassword: "NewPassw0rd!123",
      token: "paste-reset-token-from-email",
    },
  ],
  [
    "POST /send-verification-email",
    {
      email: "demo.customer@example.com",
      callbackURL: "http://localhost:3001/auth/verify-email",
    },
  ],
  [
    "POST /change-password",
    {
      currentPassword: "Passw0rd!123",
      newPassword: "NewPassw0rd!123",
      revokeOtherSessions: true,
    },
  ],
  [
    "POST /change-email",
    {
      newEmail: "demo.customer+new@example.com",
      callbackURL: "http://localhost:3001/auth/verify-email",
    },
  ],
  [
    "POST /update-user",
    {
      name: "Demo Customer",
      image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  ],
]);

const authParameterExamples = new Map<string, JsonObject>([
  [
    "GET /verify-email",
    {
      token: "paste-verification-token-from-email",
      callbackURL: "http://localhost:3001/auth/verified",
    },
  ],
]);

export async function generateAuthOpenApiSchema(auth: typeof authInstance) {
  const schema = openApiDocumentSchema.parse(await auth.api.generateOpenAPISchema());

  for (const [path, methods] of Object.entries(schema.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation === undefined) continue;
      const key = `${method.toUpperCase()} ${path}`;

      const bodyExample = authBodyExamples.get(key);
      if (bodyExample !== undefined) {
        addJsonBodyExample(operation, bodyExample);
      }

      const parameterExamples = authParameterExamples.get(key);
      if (parameterExamples !== undefined) {
        addParameterExamples(operation, parameterExamples);
      }
    }
  }

  return schema;
}

function addJsonBodyExample(operation: OpenApiOperation, example: JsonObject) {
  operation.requestBody = {
    ...operation.requestBody,
    content: {
      ...operation.requestBody?.content,
      "application/json": {
        ...operation.requestBody?.content?.["application/json"],
        example,
      },
    },
  };
}

function addParameterExamples(operation: OpenApiOperation, examples: JsonObject) {
  operation.parameters = operation.parameters?.map((parameter) =>
    parameter.name !== undefined && parameter.name in examples
      ? { ...parameter, example: examples[parameter.name] }
      : parameter,
  );
}
