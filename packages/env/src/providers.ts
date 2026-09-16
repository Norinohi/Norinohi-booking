/*
 * What the codebase knows about each inventory provider that is not the adapter itself.
 *
 * Lives in `env` because it is the one workspace every consumer already depends on: the env
 * schema validates `PROVIDER_MODE` against these keys, `packages/db` ranks and filters by them
 * in SQL, and `packages/providers` and `packages/api` build on both. `db` cannot import
 * `providers`, so anywhere higher would have left the read model restating the list. Kept free
 * of imports so that importing it never loads the env validation.
 */

export interface ProviderMetaEntry {
  /** The name a `provider` row is created with the first time this provider syncs. */
  readonly displayName: string;
  /**
   * A fixture rather than a vendor: seeded so local development can transact against it, but
   * never imported by a sync fan-out and never given media to mirror.
   */
  readonly fixture: boolean;
  /**
   * Default commercial tie-break, lowest first: who we sell through when nothing else separates
   * two offers. The admin setting overrides it; this is what an unconfigured database uses.
   */
  readonly transactingRank: number;
  /**
   * Whose title, specs and photographs a merged listing shows when completeness ties. Separate
   * from `transactingRank` on purpose, see `marketplace_setting.transacting_preference`.
   */
  readonly contentRank: number;
  /** Whose photos front a merged listing, lowest first. Null sorts after every ranked source. */
  readonly mediaRank: number | null;
  /** Days of notice the vendor needs before check-in, where longer than the shared floor. */
  readonly leadDays: number | null;
  /**
   * Which optional extras the booking flow may offer as a priced choice, by kind. It mirrors
   * what the adapter can match a selection against, so it has to be revisited whenever the
   * adapter learns a new id space.
   */
  readonly selectableExtraKinds: "all" | readonly string[];
}

export const PROVIDER_META = {
  /* Keeps one flat code space and prices anything in it. */
  mock: {
    displayName: "Mock Inventory Provider",
    fixture: true,
    transactingRank: 2,
    contentRank: 2,
    mediaRank: null,
    leadDays: null,
    selectableExtraKinds: "all",
  },
  booking_manager: {
    displayName: "Booking Manager",
    fixture: false,
    transactingRank: 0,
    contentRank: 0,
    /* Booking Manager photographs better than NauSYS (architecture §3). */
    mediaRank: 0,
    /*
     * Measured in Sep 2026 on three nights among yachts our occupancy called free: Booking
     * Manager offered none of 20 from tomorrow and half of them from two days out, the same
     * share as from five or eight, so it takes two. NauSYS offered 55 of 60 from tomorrow
     * against 57 of 60 from two days, so it keeps the floor.
     */
    leadDays: 2,
    /*
     * Publishes optional extras in its catalogue but exposes none on the offer it quotes from,
     * so none of them can be priced.
     */
    selectableExtraKinds: [],
  },
  nausys: {
    displayName: "NauSYS",
    fixture: false,
    transactingRank: 1,
    contentRank: 1,
    mediaRank: 1,
    leadDays: null,
    /*
     * Offers key on `serviceId`; no recorded offer has ever carried the `extraId` shape, so an
     * `equipment` code has nothing to match against.
     */
    selectableExtraKinds: ["service"],
  },
} as const satisfies Readonly<Record<string, ProviderMetaEntry>>;

export type ProviderKey = keyof typeof PROVIDER_META;

export function isProviderKey(code: string): code is ProviderKey {
  return Object.hasOwn(PROVIDER_META, code);
}

/** Every provider key, in declaration order, which is also the order a sync fans out in. */
export const PROVIDER_KEYS: readonly ProviderKey[] =
  Object.keys(PROVIDER_META).filter(isProviderKey);

export function providerMeta(key: ProviderKey): ProviderMetaEntry {
  return PROVIDER_META[key];
}

/** The entry for a code read from storage, or undefined for one this build does not know. */
export function findProviderMeta(code: string): ProviderMetaEntry | undefined {
  return isProviderKey(code) ? PROVIDER_META[code] : undefined;
}

function keysOrderedBy(rank: (entry: ProviderMetaEntry) => number): readonly ProviderKey[] {
  return [...PROVIDER_KEYS].sort(
    (left, right) => rank(providerMeta(left)) - rank(providerMeta(right)),
  );
}

/** Architecture §3, and the client's answer to §3.4 item 6: Booking Manager wins a tie. */
export const DEFAULT_TRANSACTING_PREFERENCE = keysOrderedBy((entry) => entry.transactingRank);

export const CONTENT_PREFERENCE = keysOrderedBy((entry) => entry.contentRank);

/** Providers whose media is ranked, best first, with their rank. */
export const MEDIA_RANKED_PROVIDERS: readonly { key: ProviderKey; rank: number }[] =
  PROVIDER_KEYS.flatMap((key) => {
    const rank = providerMeta(key).mediaRank;
    return rank === null ? [] : [{ key, rank }];
  }).sort((left, right) => left.rank - right.rank);

export const UNRANKED_MEDIA_RANK =
  Math.max(-1, ...MEDIA_RANKED_PROVIDERS.map((entry) => entry.rank)) + 1;

/** The media rank of a `listing_media.source`, where null and unknown sources sort last. */
export function mediaRankOf(source: string | null): number {
  if (source === null) return UNRANKED_MEDIA_RANK;
  return findProviderMeta(source)?.mediaRank ?? UNRANKED_MEDIA_RANK;
}

/** Whether the booking flow may offer an extra of `kind` from `source` as a priced choice. */
export function isSelectableExtraSource(source: string, kind: string): boolean {
  const kinds = findProviderMeta(source)?.selectableExtraKinds;
  if (kinds === undefined) return false;
  return kinds === "all" || kinds.includes(kind);
}
