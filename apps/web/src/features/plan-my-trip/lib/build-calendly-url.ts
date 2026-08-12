import type { PlannerAnswers } from "./search-params";

/**
 * Appends the planner answers to the Calendly link as UTM params, so a booked call
 * carries the trip context into Calendly's invitee/tracking details. Also quiets the
 * embed's own chrome (GDPR banner, event details) since it's already inside our card.
 */
export function buildCalendlyUrl(baseUrl: string, answers: PlannerAnswers): string {
  const summary = [
    answers.destination && `destination:${answers.destination}`,
    answers.groupSize && `groupSize:${answers.groupSize}`,
    answers.experience && `experience:${answers.experience}`,
    answers.vibe && `vibe:${answers.vibe}`,
    answers.duration && `duration:${answers.duration}`,
    answers.budget && `budget:${answers.budget}`,
  ]
    .filter(Boolean)
    .join(";");

  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", "plan_my_trip");
  url.searchParams.set("utm_campaign", "consultation");
  if (summary) url.searchParams.set("utm_content", summary);
  url.searchParams.set("hide_gdpr_banner", "1");
  url.searchParams.set("hide_event_type_details", "1");

  return url.toString();
}
