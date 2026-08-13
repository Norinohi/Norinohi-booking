import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/* Admin console view-types, inferred from the oRPC contract. */
type AdminClient = AppRouterClient["admin"];

export type DuplicateQueue = Awaited<ReturnType<AdminClient["match"]["queue"]>>;
export type DuplicateCandidate = DuplicateQueue["items"][number];
export type DuplicateDecision = DuplicateCandidate["decision"];
export type DuplicateSide = DuplicateCandidate["sideA"];
export type DuplicateSideListing = NonNullable<DuplicateSide["listing"]>;

export type SyncRunList = Awaited<ReturnType<AdminClient["provider"]["syncRuns"]>>;
export type SyncRunRow = SyncRunList["items"][number];
export type SyncRunKind = SyncRunRow["kind"];
export type SyncRunState = SyncRunRow["status"];
export type SyncRunStatus = Awaited<ReturnType<AdminClient["provider"]["syncStatus"]>>;

/** The connector keys the provider procedures accept, as the contract spells them. */
export type ProviderKey = SyncRunStatus["provider"];

const PROVIDER_KEYS: readonly string[] = ["mock", "booking_manager", "nausys"];

/**
 * `SyncRunRow.provider` is the stored provider code, deliberately a plain string so a run
 * belonging to a connector this build does not ship still lists. `syncStatus` only takes the
 * three it knows, so a row has to be narrowed before its errors can be fetched.
 */
export function toProviderKey(code: string): ProviderKey | undefined {
  return PROVIDER_KEYS.includes(code) ? (code as ProviderKey) : undefined;
}
