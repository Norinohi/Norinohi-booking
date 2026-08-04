type OpenApiMediaType = {
  example?: unknown;
};

type OpenApiOperation = {
  parameters?: Array<{
    name?: string;
    example?: unknown;
  }>;
  requestBody?: {
    content?: Record<string, OpenApiMediaType>;
  };
};

type OpenApiSchema = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

type AuthOpenApiGenerator = {
  api: {
    generateOpenAPISchema: () => Promise<unknown>;
  };
};

const authBodyExamples: Record<string, unknown> = {
  "POST /sign-up/email": {
    name: "Demo Customer",
    email: "demo.customer@example.com",
    password: "Passw0rd!123",
    callbackURL: "http://localhost:3001/auth/verify-email",
    rememberMe: true,
  },
  "POST /sign-in/email": {
    email: "demo.customer@example.com",
    password: "Passw0rd!123",
    rememberMe: true,
  },
  "POST /sign-out": {},
  "POST /request-password-reset": {
    email: "demo.customer@example.com",
    redirectTo: "http://localhost:3001/auth/reset-password",
  },
  "POST /reset-password": {
    newPassword: "NewPassw0rd!123",
    token: "paste-reset-token-from-email",
  },
  "POST /send-verification-email": {
    email: "demo.customer@example.com",
    callbackURL: "http://localhost:3001/auth/verify-email",
  },
  "POST /change-password": {
    currentPassword: "Passw0rd!123",
    newPassword: "NewPassw0rd!123",
    revokeOtherSessions: true,
  },
  "POST /change-email": {
    newEmail: "demo.customer+new@example.com",
    callbackURL: "http://localhost:3001/auth/verify-email",
  },
  "POST /update-user": {
    name: "Demo Customer",
    image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  },
};

const authParameterExamples: Record<string, Record<string, unknown>> = {
  "GET /verify-email": {
    token: "paste-verification-token-from-email",
    callbackURL: "http://localhost:3001/auth/verified",
  },
};

export async function generateAuthOpenApiSchema(auth: AuthOpenApiGenerator) {
  const schema = (await auth.api.generateOpenAPISchema()) as OpenApiSchema;

  for (const [path, methods] of Object.entries(schema.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = `${method.toUpperCase()} ${path}`;
      const bodyExample = authBodyExamples[key];
      if (bodyExample !== undefined) {
        addJsonBodyExample(operation, bodyExample);
      }

      const parameterExamples = authParameterExamples[key];
      if (parameterExamples) {
        addParameterExamples(operation, parameterExamples);
      }
    }
  }

  return schema;
}

function addJsonBodyExample(operation: OpenApiOperation, example: unknown) {
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

function addParameterExamples(operation: OpenApiOperation, examples: Record<string, unknown>) {
  operation.parameters = operation.parameters?.map((parameter) =>
    parameter.name && parameter.name in examples
      ? { ...parameter, example: examples[parameter.name] }
      : parameter,
  );
}
