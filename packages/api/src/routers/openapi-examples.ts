type OpenApiParameter = {
  name?: string;
  in?: string;
  example?: unknown;
};

type OpenApiMediaType = {
  example?: unknown;
};

type OpenApiOperation = {
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, OpenApiMediaType>;
  };
};

type OpenApiSpecCallback = (operation: any) => any;

export function withParameterExamples(examples: Record<string, unknown>): OpenApiSpecCallback {
  return (operation: OpenApiOperation) => ({
    ...operation,
    parameters: operation.parameters?.map((parameter) => {
      if (!("name" in parameter) || !parameter.name || !(parameter.name in examples)) {
        return parameter;
      }

      return { ...parameter, example: examples[parameter.name] };
    }),
  });
}

export function withJsonBodyExample(example: unknown): OpenApiSpecCallback {
  return (operation: OpenApiOperation) => ({
    ...operation,
    requestBody: {
      ...operation.requestBody,
      content: {
        ...operation.requestBody?.content,
        "application/json": {
          ...operation.requestBody?.content?.["application/json"],
          example,
        },
      },
    },
  });
}
