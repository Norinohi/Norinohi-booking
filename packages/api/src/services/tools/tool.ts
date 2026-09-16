import { z } from "zod";

import type { Database } from "../../context";
import { BadRequestError, InternalError } from "../../errors";

/** Everything a tool may reach. No session, request or response: a tool is not an endpoint. */
export type ToolContext = {
  db: Database;
};

export type Tool<TInput extends z.ZodType, TOutput extends z.ZodType> = {
  name: string;
  /** Written for a model choosing between tools, not for a person reading the API docs. */
  description: string;
  input: TInput;
  output: TOutput;
  run: (ctx: ToolContext, input: z.output<TInput>) => Promise<z.input<TOutput>>;
};

export function defineTool<TInput extends z.ZodType, TOutput extends z.ZodType>(
  tool: Tool<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return tool;
}

/**
 * Validates, runs, and validates again.
 *
 * `run` is only ever handed parsed input, so a caller that skips this and calls `run` directly
 * owns the validation. The output is parsed too: a tool answering a model has no client-side type
 * checker behind it, so drift from the declared schema is caught here instead of in a prompt.
 */
export async function invokeTool<TInput extends z.ZodType, TOutput extends z.ZodType>(
  tool: Tool<TInput, TOutput>,
  ctx: ToolContext,
  input: z.input<TInput>,
): Promise<z.output<TOutput>> {
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError({
      message: `${tool.name}: ${z.prettifyError(parsed.error)}`,
      data: { code: "TOOL_INPUT_INVALID" },
    });
  }

  const result = tool.output.safeParse(await tool.run(ctx, parsed.data));
  if (!result.success) {
    throw new InternalError({
      message: `${tool.name} returned an invalid result`,
      cause: result.error,
    });
  }
  return result.data;
}
