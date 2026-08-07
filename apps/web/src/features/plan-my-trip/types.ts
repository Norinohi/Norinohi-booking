import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/** The output of `planner.recommend` — a trip recommendation backed by real inventory. */
export type PlannerRecommendation = Awaited<ReturnType<AppRouterClient["planner"]["recommend"]>>;
