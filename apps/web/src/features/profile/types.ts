import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/** View-type of the current user's profile, inferred from the oRPC contract. */
export type Profile = Awaited<ReturnType<AppRouterClient["profile"]["get"]>>;
