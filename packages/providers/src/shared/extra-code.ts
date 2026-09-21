import type { CanonicalExtra } from "../types";

/**
 * The one identity an extra has, everywhere outside a vendor payload.
 *
 * `kind` names the provider id space and `externalId` is the vendor's own id in
 * it. Both halves are load-bearing: NauSYS numbers services and equipment
 * independently, so `52` alone is ambiguous and `service:52` is not.
 *
 * The same string is what `provider_extra_catalogue` keys on, what the listing
 * page renders, what the customer's selection submits, and what an adapter puts
 * back on the quote line it prices. Before this existed there were three
 * namespaces for the concept and none of them met, which is why ticking an extra
 * changed nothing.
 */
const SEPARATOR = ":";

/**
 * Between an extra's code and one of its variants: `service:100511@66279570`.
 *
 * NauSYS can put one service on an offer several times, one row per route or vehicle ("Athens
 * Airport - Lavrion base; taxi 1 - 3 pax" at 60, "bus up to 50 pax" at 300). They are
 * alternatives, and the code alone cannot say which one was chosen, so a ticked transfer used
 * to bill all seven. The suffix is the vendor's id for the row, which is also what `addExtras`
 * takes to put that row on a reservation.
 */
const VARIANT_SEPARATOR = "@";

export type ExtraKind = CanonicalExtra["kind"];

export interface ParsedExtraCode {
  kind: ExtraKind;
  externalId: string;
  /** Present on a variant code only. */
  variantId?: string;
}

export function formatExtraCode(kind: ExtraKind, externalId: string): string {
  return `${kind}${SEPARATOR}${externalId}`;
}

export function formatExtraVariantCode(
  kind: ExtraKind,
  externalId: string,
  variantId: string,
): string {
  return `${formatExtraCode(kind, externalId)}${VARIANT_SEPARATOR}${variantId}`;
}

/**
 * Null rather than a throw: these strings arrive from a client request, so an
 * unparseable one is bad input to report, not a broken invariant. Splitting on
 * the first separator only, because a vendor id may contain one.
 */
export function parseExtraCode(code: string): ParsedExtraCode | null {
  const at = code.indexOf(SEPARATOR);
  if (at <= 0) return null;

  const kind = code.slice(0, at);
  const rest = code.slice(at + 1);
  if (kind !== "service" && kind !== "equipment") return null;

  const variantAt = rest.indexOf(VARIANT_SEPARATOR);
  const externalId = variantAt === -1 ? rest : rest.slice(0, variantAt);
  if (externalId.length === 0) return null;
  if (variantAt === -1) return { kind, externalId };

  const variantId = rest.slice(variantAt + 1);
  if (variantId.length === 0) return null;
  return { kind, externalId, variantId };
}

/**
 * The extra a code names, without the variant. The catalogue has one row per extra, so this is
 * the form every catalogue lookup and whitelist check needs.
 */
export function baseExtraCode(code: string): string {
  const parsed = parseExtraCode(code);
  return parsed === null ? code : formatExtraCode(parsed.kind, parsed.externalId);
}

/** The vendor ids of the selected codes that belong to one id space. */
export function externalIdsOfKind(codes: readonly string[], kind: ExtraKind): Set<string> {
  const ids = new Set<string>();
  for (const code of codes) {
    const parsed = parseExtraCode(code);
    if (parsed?.kind === kind) ids.add(parsed.externalId);
  }
  return ids;
}
