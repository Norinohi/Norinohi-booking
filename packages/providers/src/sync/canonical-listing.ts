/*
 * Which offer each part of the canonical listing is taken from.
 *
 * A listing both vendors sell has two of everything: two titles, two spec blocks, two
 * readings of where the boat is based. Before this, whichever sync finished last wrote
 * `listing` and `listing_specification`, so a merged boat's title and cabin count changed
 * nightly and neither value was anybody's decision. Nothing writes those rows directly any
 * more: each provider writes its own `listing_offer`, and this resolves the listing from
 * them, so there is one writer and nothing left to fight over.
 *
 * The order is docs/backend-architecture.md §3.4, made executable.
 */

/**
 * The groups a listing is resolved in, matching the `listing_field` enum.
 *
 * Groups rather than columns, because the fields inside one move together: taking the
 * length from one vendor and the beam from another would describe a boat that does not
 * exist anywhere.
 */
export const FIELD_GROUPS = [
  "title",
  "spec",
  "taxonomy",
  "operator",
  "home_base",
  "pets",
  "media",
  "description",
] as const;

export type FieldGroup = (typeof FIELD_GROUPS)[number];

/**
 * Architecture §3: Booking Manager wins a tie between linked sources. The same order the
 * transacting tie-break uses, so a merged listing does not read as one vendor and sell as
 * the other.
 */
export const PROVIDER_PREFERENCE = ["booking_manager", "nausys", "mock"] as const;

export type OfferFieldCandidate = {
  offerId: string;
  providerCode: string;
  /**
   * How much this offer actually says, per group: the count of fields the provider filled
   * in. This is what §3.4 means by "the more complete record", and it is counted at
   * projection time rather than guessed here.
   */
  completeness: Readonly<Partial<Record<FieldGroup, number>>>;
};

/**
 * Groups where a stated rule outranks completeness.
 *
 * Only media so far, and it is not a matter of how much each vendor sent: Booking Manager
 * photographs better, so a thin BM gallery still beats a fuller NauSYS one. Everything else
 * takes the fuller record.
 */
const PROVIDER_FIRST: ReadonlySet<FieldGroup> = new Set<FieldGroup>(["media"]);

/**
 * The winning offer for each group.
 *
 * `overrides` are the `locked` rows in `listing_field_source`, which are an admin's decision
 * and outrank everything below. An override naming an offer that is no longer a candidate is
 * ignored rather than honoured: the offer has been retired or split away, and freezing the
 * listing on a vendor that no longer sells it would be worse than falling back.
 *
 * Deterministic to the last step, and the last step is the offer id rather than input order,
 * so two runs over the same data resolve the same way and the search document does not churn.
 */
export function resolveFields(
  candidates: readonly OfferFieldCandidate[],
  overrides: ReadonlyMap<FieldGroup, string> = new Map(),
  preference: readonly string[] = PROVIDER_PREFERENCE,
): Map<FieldGroup, string> {
  const winners = new Map<FieldGroup, string>();
  if (candidates.length === 0) return winners;

  const byId = new Map(candidates.map((candidate) => [candidate.offerId, candidate]));

  for (const group of FIELD_GROUPS) {
    const override = overrides.get(group);
    if (override !== undefined && byId.has(override)) {
      winners.set(group, override);
      continue;
    }

    const ranked = [...candidates].sort((left, right) =>
      compareCandidates(left, right, group, preference),
    );
    const best = ranked[0];
    if (best) winners.set(group, best.offerId);
  }

  return winners;
}

function compareCandidates(
  left: OfferFieldCandidate,
  right: OfferFieldCandidate,
  group: FieldGroup,
  preference: readonly string[],
): number {
  const byProvider = providerRank(left, preference) - providerRank(right, preference);
  const byCompleteness = (right.completeness[group] ?? 0) - (left.completeness[group] ?? 0);

  const [first, second] = PROVIDER_FIRST.has(group)
    ? [byProvider, byCompleteness]
    : [byCompleteness, byProvider];

  if (first !== 0) return first;
  if (second !== 0) return second;
  return left.offerId < right.offerId ? -1 : left.offerId > right.offerId ? 1 : 0;
}

/** A provider the preference does not name sorts after every one it does. */
function providerRank(candidate: OfferFieldCandidate, preference: readonly string[]): number {
  const index = preference.indexOf(candidate.providerCode);
  return index === -1 ? preference.length : index;
}

/**
 * How much of a group an offer filled in.
 *
 * `null` and `undefined` are the same absence here, but an empty string is not: a provider
 * that sent a blank title said something, and treating it as silence would let the other
 * vendor win a group it had no better claim to. Callers pass the raw column values.
 */
export function countStated(values: readonly unknown[]): number {
  return values.filter((value) => value !== null && value !== undefined).length;
}
