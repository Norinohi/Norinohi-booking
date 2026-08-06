import { plannerAnswersSchema, plannerRecommendationSchema } from "../contracts/planner";
import { publicProcedure } from "../index";
import { recommendTrip } from "../services/planner";
import { withJsonBodyExample } from "./openapi-examples";

export const plannerRouter = {
  recommend: publicProcedure
    .route({
      method: "POST",
      path: "/planner/recommend",
      operationId: "recommendTrip",
      summary: "Recommend a trip from the planner answers",
      description:
        "Turns the six 'Help me plan my trip' answers into a recommendation backed by real inventory: the destination, the kind of yacht, whether a skipper is needed, an estimated price per person per week, and one recommended listing. Every answer is optional — an unanswered or 'Not sure' step falls back to a sensible default. The search widens in steps rather than returning nothing, and searchParams mirrors the equivalent /yachts query so the results screen can link through to the full list.",
      tags: ["Planner"],
      successDescription: "A trip recommendation with the matching listing.",
      spec: withJsonBodyExample({
        destination: "greece",
        groupSize: "5-8",
        experience: "none",
        vibe: "family",
        duration: "21",
        budget: "300-600",
      }),
    })
    .input(plannerAnswersSchema)
    .output(plannerRecommendationSchema)
    .handler(({ context, input }) => recommendTrip(context.db, input)),
};
