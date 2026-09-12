/**
 * The scheduler link for the standalone contact page.
 *
 * The planner's version carries the quiz answers as `utm_content`; this page has none, so it
 * only marks where the call came from. The two `hide_*` flags are the same: the embed sits
 * inside our own card and does not need its own chrome.
 */
export function contactCalendlyUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", "contact");
  url.searchParams.set("utm_campaign", "contact");
  url.searchParams.set("hide_gdpr_banner", "1");
  url.searchParams.set("hide_event_type_details", "1");
  return url.toString();
}
