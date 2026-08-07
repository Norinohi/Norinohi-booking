import { orpc } from "@/utils/orpc";

import type { PlannerRecommendInput } from "../lib/to-planner-input";

/** A derived read of the wizard's answers, so it's a query (cached, keyed by input) despite `planner.recommend` being a POST. */
export const plannerRecommendationQueryOptions = (input: PlannerRecommendInput) =>
  orpc.planner.recommend.queryOptions({ input });
