import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import { orpc } from "@/utils/orpc";

export type ResultsInput = Parameters<AppRouterClient["charterSearch"]["results"]>[0];

export const resultsQueryOptions = (input: ResultsInput) =>
  orpc.charterSearch.results.queryOptions({ input });
