import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { ReactNode } from "react";

import type { CardNote } from "@/components/shared/data-display/card-note";
import type { Marina } from "@/components/shared/overlay/marina-popover";
import type { AppPathname } from "@/i18n/navigation";

/** The catalogue's listing, which search results, popular yachts, the wishlist and the planner all return. */
export type YachtListing = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["results"]>
>["items"][number]["listing"];

export type YachtCardBadge = {
  label: string;
  icon?: ReactNode;
  solid?: boolean;
  /** Anything other than brand blue: the availability status chips and the unavailable tag. */
  tone?: "neutral" | "success" | "warning";
};

export type YachtCardSpec = {
  label: string;
  value: string;
  /**
   * Drawn in place of the check mark and the spelled-out label ("Toilets: 2" becomes a toilet
   * glyph and "2"). The label survives as the tooltip and the accessible name.
   */
  icon?: ReactNode;
};

export type YachtCardAmenity = { icon: ReactNode; label: string };

/** Which line this is, kept apart from its wording so both surfaces can colour it the same. */
export type YachtCardStat = { kind: "booked" | "viewed"; label: string };

/**
 * A charter endpoint: the calendar day, and the marina's wall-clock time for it.
 *
 * `time` is text the provider states about its own base, never an instant. Combining the two
 * into a timestamp would need an IANA zone per marina, which no provider sends, and the card
 * carried a hardcoded Zagreb one for exactly that reason. Kept apart and rendered as given.
 */
export type YachtCardCharterDate = { day: string; time: string | null };

/** Everything a listing card says about one boat, independent of how the card is laid out. */
export type YachtCardData = {
  /** Listing id, absent on cards rendering sample data, which leaves the bookmark inert. */
  id?: string;
  images: string[];
  imageAlt?: string;
  badges?: YachtCardBadge[];
  marina: Marina;
  name: string;
  /** Absent for a listing nobody has rated: the chip is dropped rather than showing a zero. */
  rating?: string;
  charterType: string;
  crew: string;
  specs: YachtCardSpec[];
  amenities?: YachtCardAmenity[];
  /**
   * The curated amenities that did not fit, revealed behind a "+N". Separate from `amenities`
   * rather than a count, because the tooltip lists them by name and icon.
   */
  amenitiesOverflow?: YachtCardAmenity[];
  stats?: YachtCardStat[];
  /**
   * The charter the dates describe: the one that was searched for, or, on an undated search,
   * the first one this boat would sell. Absent where no period is in play at all: the wishlist
   * is not a search result, and a boat with nothing to sell has no period to name.
   */
  start?: YachtCardCharterDate;
  end?: YachtCardCharterDate;
  /*
   * Said above the dates when they are not the ones searched for. Search keeps a boat that is
   * free across the window but turns around on another weekday, so the card shows the charter
   * this boat would actually sell; without a word here that reads as the wrong dates.
   */
  datesNote?: string;
  /**
   * Another customer's temporary booking over the searched week. Present only on the boats the
   * hold filter added to the results, where the dates above are the ones somebody else is
   * holding, so the card has to say what the visitor would be waiting for. `expiresAt` is null
   * where the vendor stated no deadline.
   */
  hold?: { expiresAt: string | null };
  priceLabel: string;
  /** What qualifies an estimated or list price, behind an info icon beside the label. */
  priceHint?: string;
  price: string;
  /**
   * The same charter before the operator's discount, struck through beside the price. Absent
   * unless the vendor is genuinely selling below its own list, which is the ordinary case.
   */
  listPrice?: string;
  /**
   * What the obligatory extras add, where the amount above is the charter rate without them.
   *
   * Sits under the price rather than beside it: it is the second half of one figure, not a
   * second figure, and a card that showed a rate with no hint of what rides on top would be
   * quoting a number the guest cannot pay.
   */
  priceExtras?: string;
  /**
   * Whether the label reads into the amount ("From €1,690") rather than captioning it
   * ("Price for 7 days").
   *
   * The narrow layout prints the amount first and the caption after it, which is right for a
   * caption and backwards for a preposition: the card read "€1,690 From". A leading label
   * keeps its place in both layouts.
   */
  priceLabelLeads?: boolean;
  /** The price slot holds words ("On request", "Unavailable") rather than an amount, so it drops to text size. */
  priceIsLabel?: boolean;
  /** The listing has no bookable dates: the photo desaturates and the copy dims. */
  unavailable?: boolean;
  /** The quote's own figure over the real party size. Absent on a catalogue card, which has no
      party size and whose berth-based division read as a price of its own. */
  perPerson?: string;
  /**
   * The same amount over the nights it covers, so a list ordered by nightly rate reads in order.
   * "Price: low to high" sorts on this, and against totals for charters of different lengths the
   * sequence looked shuffled: a cheaper week sat above a dearer three nights with nothing on
   * either card to say why.
   */
  perNight?: string;
  /** Money footnote under the price, with the tooltip that explains that figure. */
  note: CardNote | null;
  detailHref?: AppPathname;
};

/** The carousel tile: one photo, the place, the name and a single price line. */
export type YachtTileData = {
  id: string;
  image: string;
  imageAlt: string;
  /** The slot the tile gives its photo, which is what Next picks the source width from. */
  imageSizes: string;
  location: string;
  name: string;
  detailHref: AppPathname;
  rating?: number;
  tags: { label: string; icon?: ReactNode }[];
  price: string;
  listPrice?: string;
  priceLabel: string;
  priceSuffix: ReactNode;
  actionLabel: string;
};
