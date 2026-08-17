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

export type ExtraKind = CanonicalExtra["kind"];

export interface ParsedExtraCode {
  kind: ExtraKind;
  externalId: string;
}

export function formatExtraCode(kind: ExtraKind, externalId: string): string {
  return `${kind}${SEPARATOR}${externalId}`;
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
  const externalId = code.slice(at + 1);
  if (externalId.length === 0) return null;
  if (kind !== "service" && kind !== "equipment") return null;

  return { kind, externalId };
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
