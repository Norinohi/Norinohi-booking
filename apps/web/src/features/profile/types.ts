import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/** View-type of the current user's profile, inferred from the oRPC contract. */
export type Profile = Awaited<ReturnType<AppRouterClient["profile"]["get"]>>;

/** Share code, stat tiles and loyalty progress behind /profile/referrals. */
export type ReferralSummary = Awaited<ReturnType<AppRouterClient["referral"]["summary"]>>;

export type ReferralHistoryRow = Awaited<
  ReturnType<AppRouterClient["referral"]["history"]>
>["items"][number];

export type CreditLedgerRow = Awaited<
  ReturnType<AppRouterClient["credit"]["ledger"]>
>["items"][number];

export type CreditLedgerKind = CreditLedgerRow["kind"];

/* Admin Discount & Price Manager view-types, inferred from the oRPC contract. */
type AdminClient = AppRouterClient["admin"];

export type DiscountList = Awaited<ReturnType<AdminClient["discount"]["list"]>>;
export type Discount = DiscountList["items"][number];
export type DiscountStatus = Discount["status"];
export type YachtOption = Awaited<
  ReturnType<AdminClient["discount"]["yachtOptions"]>
>["items"][number];

export type ListingPriceList = Awaited<ReturnType<AdminClient["listingPrice"]["list"]>>;
export type ListingPriceRow = ListingPriceList["items"][number];
export type ListingPriceFilters = Awaited<ReturnType<AdminClient["listingPrice"]["filters"]>>;

/* My Bookings view-types, inferred from the oRPC contract. */
export type BookingList = Awaited<ReturnType<AppRouterClient["booking"]["list"]>>;
export type BookingSummary = BookingList["items"][number];
export type BookingStatus = BookingSummary["status"];
