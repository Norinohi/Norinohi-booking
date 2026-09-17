import { z } from "zod";

import { nearestMarinas } from "./nearest-marinas";
import { quotePreview } from "./quote-preview";
import { searchYachts } from "./search-yachts";
import { suggestRoutes } from "./suggest-routes";
import { yachtAvailability } from "./yacht-availability";

export { defineTool, invokeTool, type Tool, type ToolContext } from "./tool";

/** Every tool a caller outside the HTTP layer may run, keyed by its own `name`. */
export const tools = {
  searchYachts,
  yachtAvailability,
  quotePreview,
  suggestRoutes,
  nearestMarinas,
};

export type ToolName = keyof typeof tools;

/**
 * Name, description and JSON Schema for each tool, in the form model tool-calling APIs take.
 *
 * The input side is described, since that is what a model writes. Refinements such as "checkOut
 * after checkIn" have no JSON Schema form, so `invokeTool` still enforces them.
 */
export function toolManifest() {
  return Object.values(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }),
  }));
}
