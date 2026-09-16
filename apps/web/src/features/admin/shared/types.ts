import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { PROVIDER_KEYS } from "@yacht-charter/env/providers";

/* Admin console view-types, inferred from the oRPC contract. */
export type AdminClient = AppRouterClient["admin"];
export type SyncRunStatus = Awaited<ReturnType<AdminClient["provider"]["syncStatus"]>>;

/** The connector keys the provider procedures accept, as the contract spells them. */
export type ProviderKey = SyncRunStatus["provider"];

/**
 * `SyncRunRow.provider` is the stored provider code, deliberately a plain string so a run
 * belonging to a connector this build does not ship still lists. `syncStatus` only takes the
 * three it knows, so a row has to be narrowed before its errors can be fetched.
 */
export function toProviderKey(code: string): ProviderKey | undefined {
  return PROVIDER_KEYS.find((key) => key === code);
}
