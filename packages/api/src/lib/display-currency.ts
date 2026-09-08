/*
 * Which currency a visitor sees prices in, and what that number means.
 *
 * Everything here is pure and runs in the browser, and lives in `packages/api` only because
 * that is where the repository has a test harness -- the same reason `availability-rules.ts`
 * is imported by the date picker. The server keeps sending the currency each
 * vendor published in -- a Bahamas fleet in USD, a Croatian one in EUR -- because a cached page
 * cannot vary by visitor without giving up the prerendered shell it is served from
 * (docs/adr/0002). Conversion is therefore a display step applied after mount, and it never
 * touches what anybody is charged: the quote holds one currency and is settled in it.
 *
 * That makes every figure this produces indicative. ECB reference rates are not what a card
 * network will apply, so a converted price is marked as approximate and the payment screen
 * always states the currency and amount that will actually leave the account.
 */

/** What the catalogue compares in, and the base every stored rate is quoted against. */
export const BASE_CURRENCY = "EUR";

/** The currencies the client named, plus the base. Anything else is not offered. */
export const DISPLAY_CURRENCIES = ["EUR", "USD", "GBP", "PLN", "UAH"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/**
 * Country to currency, as the client listed it.
 *
 * The eurozone is written out rather than inferred: "is this country in the euro area" is a
 * question with a moving answer, and a member list that quietly drifts is worse than one that
 * is visibly a list. Everywhere absent falls back to the configured default, which is EUR.
 */
const EUROZONE = [
  "AT",
  "BE",
  "HR",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
] as const;

const COUNTRY_CURRENCY = new Map<string, DisplayCurrency>([
  ["US", "USD"],
  ["GB", "GBP"],
  ["PL", "PLN"],
  ["UA", "UAH"],
  ...EUROZONE.map((country) => [country, "EUR"] as const),
]);

export function isDisplayCurrency(value: string | null | undefined): value is DisplayCurrency {
  return DISPLAY_CURRENCIES.some((currency) => currency === value);
}

/**
 * The currency to show, most deliberate choice first.
 *
 * A visitor's own pick outranks everything and keeps outranking it: somebody who switched to
 * USD in Warsaw meant it. Detection is best-effort below that -- no country header, or a
 * country nobody configured, lands on the default rather than guessing.
 */
export function resolveDisplayCurrency(input: {
  chosen?: string | null;
  country?: string | null;
  overrides?: Record<string, string>;
  fallback?: string;
}): DisplayCurrency {
  if (isDisplayCurrency(input.chosen)) return input.chosen;

  const country = input.country?.trim().toUpperCase();
  if (country) {
    const override = input.overrides?.[country];
    if (isDisplayCurrency(override)) return override;

    const known = COUNTRY_CURRENCY.get(country);
    if (known) return known;
  }

  return isDisplayCurrency(input.fallback) ? input.fallback : "EUR";
}

/**
 * The rates a browser converts with, each carrying the day its own bank published it.
 *
 * Per rate rather than per snapshot because two banks write them: the ECB for everything the
 * euro area quotes against, and the National Bank of Ukraine for the hryvnia, which the ECB
 * stopped publishing in 2022. One can stop while the other keeps answering, and a shared date
 * would let the working source vouch for the stalled one.
 */
export type FxSnapshot = {
  base: string;
  maxAgeDays: number;
  rates: Record<string, { rate: number; asOf: string }>;
};

export type ConvertedPrice = {
  amountMinor: number;
  currency: string;
  /** True where the figure is a conversion of a price quoted in something else. */
  approximate: boolean;
};

/**
 * One published amount, in the currency the visitor reads.
 *
 * Returns the original untouched whenever the conversion would be a guess: the display
 * currency is already the published one, the snapshot is missing a leg, or the rates have gone
 * stale. A price in the vendor's own currency is always true; a converted one at a week-old
 * rate only looks true, which is the worse failure of the two.
 */
export function convertForDisplay(
  price: { amountMinor: number; currency: string },
  display: string,
  snapshot: FxSnapshot | null,
  now = new Date(),
): ConvertedPrice {
  const unchanged = { ...price, approximate: false };
  if (price.currency === display) return unchanged;
  if (!snapshot) return unchanged;

  /* Both legs, each against its own publishing date: a conversion is only as fresh as the
     staler half of it. */
  const into = usableRate(snapshot, display, now);
  const from = usableRate(snapshot, price.currency, now);
  if (into === null || from === null) return unchanged;

  return {
    amountMinor: Math.round((price.amountMinor / from) * into),
    currency: display,
    approximate: true,
  };
}

/**
 * Whether one bank's rate is too old to convert with.
 *
 * They publish on working days, so an ordinary run of holidays leaves the newest rate a few
 * days behind and that is not staleness. Past the window the source itself has stopped, and a
 * rate that silently freezes goes on producing plausible numbers forever -- which is exactly
 * the failure `packages/db/src/fx/rates.ts` refuses for the catalogue's own ordering.
 */
export function isStale(asOf: string, maxAgeDays: number, now = new Date()): boolean {
  const stamped = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(stamped)) return true;

  return (now.getTime() - stamped) / 86_400_000 > maxAgeDays;
}

/*
 * The rate to convert one currency by, or null where there is none worth using.
 *
 * The base is not in the table -- it is what the table is quoted against -- so it is 1 and can
 * never be stale. A missing entry, a non-positive one, or one whose bank stopped publishing is
 * not a rate. The values are numbers by the time they get here, because the endpoint's own
 * schema parses them.
 */
function usableRate(snapshot: FxSnapshot, currency: string, now: Date): number | null {
  if (currency === snapshot.base) return 1;

  const entry = snapshot.rates[currency];
  if (entry === undefined || !Number.isFinite(entry.rate) || entry.rate <= 0) return null;
  if (isStale(entry.asOf, snapshot.maxAgeDays, now)) return null;
  return entry.rate;
}
