/*
 * Sample discount data + view types for the /profile/discounts screen — static until the
 * discounts backend exists (mirrors SAMPLE_BOOKINGS / SAMPLE_REFERRALS). "Manage Prices" is
 * the platform-side pricing control over provider (Booking Manager / NauSYS) listings; its
 * tab designs are not delivered yet, so only the Discounts tab has content.
 */

export type DiscountType = "percentage" | "fixed";

/** Keys under `Discounts.applies`. */
export type DiscountAppliesTo =
  | "allYachts"
  | "allCatamarans"
  | "allGullets"
  | "allMotorboats"
  | "allMotorYachts"
  | "allSailboats"
  | "specific";

export type Discount = {
  id: string;
  name: string;
  code: string;
  type: DiscountType;
  /** Percentage points or fixed amount, per `type`. */
  value: number;
  appliesTo: DiscountAppliesTo;
  status: "active" | "inactive";
  /** "used/limit" as displayed. */
  usage: string;
  /** ISO dates for the expiration range, when set. */
  expires?: { from: string; to: string };
};

export const SAMPLE_DISCOUNTS: Discount[] = [
  {
    id: "d-1",
    name: "Summer Campaign 2026",
    code: "SUMMER10",
    type: "percentage",
    value: 10,
    appliesTo: "allYachts",
    status: "active",
    usage: "45/100",
    expires: { from: "2026-07-07", to: "2026-07-30" },
  },
  {
    id: "d-2",
    name: "Welcome Offer",
    code: "WELCOME50",
    type: "percentage",
    value: 10,
    appliesTo: "allYachts",
    status: "active",
    usage: "2/10",
  },
  {
    id: "d-3",
    name: "Welcome Offer",
    code: "WELCOME50",
    type: "percentage",
    value: 10,
    appliesTo: "allYachts",
    status: "active",
    usage: "2/10",
  },
  {
    id: "d-4",
    name: "Welcome Offer",
    code: "WELCOME50",
    type: "percentage",
    value: 10,
    appliesTo: "allYachts",
    status: "active",
    usage: "2/10",
  },
];

export const DISCOUNTS_PAGE_COUNT = 15;

/** Options in the "Specific Yachts" searchable list — keys under `Discounts.yachtTypes`. */
export const SPECIFIC_YACHT_OPTIONS = [
  "catamaran",
  "gulet",
  "motorYacht",
  "powerCatamaran",
  "sailboat",
  "motorBoat",
] as const;

/** Checkbox order in the dialog's applies-to grid — keys under `Discounts.applies`. */
export const APPLIES_TO_OPTIONS: DiscountAppliesTo[] = [
  "allYachts",
  "allCatamarans",
  "allGullets",
  "allMotorboats",
  "allMotorYachts",
  "allSailboats",
  "specific",
];

/** A provider listing whose platform price we override — the "Manage Prices" tab rows. */
export type YachtPrice = {
  id: string;
  name: string;
  /** Yacht type as displayed in the "All types" filter. */
  type: string;
  location: string;
  basePrice: string;
  currentPrice: string;
};

export const SAMPLE_PRICES: YachtPrice[] = [
  {
    id: "y-1",
    name: "Bora Breeze",
    type: "Catamaran",
    location: "Port Royal, Croatia",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-2",
    name: "Poseidon's Pearl",
    type: "Sailboat",
    location: "The Valley",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-3",
    name: "Salty Dogs!",
    type: "Motor Yacht",
    location: "The Valley",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-4",
    name: "Bavaria Cruiser",
    type: "Sailboat",
    location: "Saint John's, Italy",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-5",
    name: "Bavaria Cruiser",
    type: "Sailboat",
    location: "Port Royal, Croatia",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-6",
    name: "Bavaria Cruiser",
    type: "Catamaran",
    location: "The Valley",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
  {
    id: "y-7",
    name: "Bavaria Cruiser",
    type: "Sailboat",
    location: "Port Royal, Croatia",
    basePrice: "€12,599",
    currentPrice: "€11,599",
  },
];

export const PRICES_PAGE_COUNT = 15;

/** Row lookups for the route-driven overlays (sample data until the APIs land). */
export function findDiscount(id: string): Discount | undefined {
  return SAMPLE_DISCOUNTS.find((discount) => discount.id === id);
}

export function findYachtPrice(id: string): YachtPrice | undefined {
  return SAMPLE_PRICES.find((yacht) => yacht.id === id);
}
