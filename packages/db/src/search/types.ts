import type { faqCategory } from "../schema/content";
import type { CrewType } from "./crew";

export type FaqCategory = (typeof faqCategory)["enumValues"][number];

export type SearchSort = "recommended" | "price-asc" | "price-desc" | "rating" | "newest";

export type ListingSearchInput = {
  destination?: string;
  query?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  category?: string;
  minCabins?: number;
  maxPriceMinor?: number;
  country?: string[];
  sailingArea?: string[];
  city?: string[];
  charterCompany?: string[];
  marina?: string[];
  boatType?: string[];
  builder?: string[];
  model?: string[];
  crew?: string[];
  mainsailType?: string[];
  equipment?: string[];
  startDate?: string;
  duration?: number;
  dateFlexibility?: "on-day" | "1-3-days" | "1-week" | "2-weeks" | "1-month";
  minLength?: number;
  maxLength?: number;
  maxCabins?: number;
  minBerths?: number;
  maxBerths?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minPriceMinor?: number;
  minBoatAge?: number;
  maxBoatAge?: number;
  yearFrom?: number;
  yearTo?: number;
  minGuestRating?: number;
  maxGuestRating?: number;
  withoutAvailabilityConfirmation?: boolean;
  underTemporaryBooking?: boolean;
  depositInsurance?: boolean;
  petsAllowed?: boolean;
  currency?: string;
  /*
   * Selects facet copy and card labels from facet_media_translation; an untranslated
   * value falls back to its default-locale label.
   */
  locale?: string;
  cursor?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  sort?: SearchSort;
};

export type ListingSearchDoc = {
  listingId: string;
  slug: string;
  title: string;
  category: string | null;
  crewType: string | null;
  builder: string | null;
  model: string | null;
  /** The model without its cabin configuration; null when the vendor name carries none. */
  modelCanonical: string | null;
  operator: string;
  /** The operator's full terms, free text; null where they published none. */
  operatorTermsAndConditions: string | null;
  baseId: string;
  baseName: string;
  /** The town the base is reached from; null until its vendor location is mapped. */
  city: string | null;
  location: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  baseEmail: string | null;
  basePhone: string | null;
  baseWebsite: string | null;
  /** Wall-clock at the marina, e.g. "17:00". Not an instant — see the column comment. */
  baseCheckInTime: string | null;
  baseCheckOutTime: string | null;
  lengthM: string | null;
  cabins: number | null;
  berths: number | null;
  heads: number | null;
  showers: number | null;
  yearBuilt: number | null;
  sailType: string | null;
  /** Refundable damage deposit taken at the base. Null when the provider takes none. */
  securityDepositMinor: number | null;
  securityDepositCurrency: string | null;
  depositInsuranceIncluded: boolean;
  petsAllowed: boolean;
  rating: string;
  reviewCount: number;
  /** Counted live off our own tables, not stored on the doc — see `engagementColumns`. */
  bookedThisMonth: number;
  viewedToday: number;
  mainImage: string | null;
  gallery: string[];
  amenities: string[];
  priceFromMinor: number | null;
  currency: string | null;
  /** The offer this card's price, dates and terms describe. Null when nothing is sellable. */
  bestOfferId: string | null;
  /** How many vendors sell this hull. */
  offerCount: number;
  availableFrom: string | null;
  availableTo: string | null;
  /** Both ends of the first sellable charter; see `bookableFrom` on the `listing_search_doc` schema. */
  bookableFrom: string | null;
  bookableTo: string | null;
  hasUnconfirmedAvailability: boolean;
  hasTemporaryBooking: boolean;
};

export type ListingSearchResult = {
  items: ListingSearchDoc[];
  nextCursor?: string;
  pagination?: ListingSearchPagination;
};

/**
 * A hand-authored itinerary, read from the route library rather than composed here.
 *
 * Every field is somebody's editorial text and every coordinate is the place itself, so nothing
 * in it is translated or derived - which is also why the whole thing is nullable. Most bases have
 * no route, and the section renders only where one exists.
 */
export type SuggestedRoute = {
  title: string;
  description: string | null;
  stops: {
    /** Position in the itinerary, from 1. Not a calendar date: a route is not a charter. */
    day: number;
    name: string;
    note: string | null;
    lat: number;
    lng: number;
  }[];
};

export type ListingDetail = ListingSearchDoc & {
  /** The provider's own prose in the requested locale; null when it ships none. */
  description: string | null;
  /**
   * `value` is null where the catalogue does not know, so each locale writes its own "not
   * specified" rather than inheriting the English one. `label` is the English fallback for a
   * code the web has no message for yet.
   */
  overview: { code: string; label: string; value: string | null }[];
  includedAmenities: { code: string; label: string }[];
  mandatoryExtras: ListingPricedItem[];
  optionalExtras: ListingOptionalItem[];
  /** What the sidebar's Crew control may offer, and what each role costs. */
  crew: {
    options: CrewType[];
    roles: ListingPricedItem[];
  };
  importantInformation: {
    charterCompany: string;
    yachtPickupAddress: string;
    yachtPickup: { time: string | null };
    yachtDropOff: { time: string | null };
    /*
     * Which sentence to render, not the sentence.
     *
     * These four used to be English prose composed here, which put four paragraphs of
     * customer-facing copy in the database package where no locale could reach them. The
     * wording lives in the web app's message files now; what this decides is which of them
     * applies, which is a data question and belongs here.
     */
    cancellationPaymentPolicies: "varies_by_selection";
    sailingLicenseRequired: "required" | "not_required";
    pets: "allowed_with_confirmation" | "ask_base";
    /** Slugs, rendered by the web: `card`, `bank_transfer`, `cash`. */
    paymentMethodsAcceptedByCharterCompany: string[];
    marinaInformation: { marina: string; location: string; country: string };
    marinaContact: {
      name: string;
      address: string;
      email: string | null;
      phone: string | null;
      website: string | null;
    };
    map: { lat: number; lng: number };
  };
  suggestedRoute: SuggestedRoute | null;
  reviews: ListingReview[];
  /** `category` is null on a listing's own entries; the six codes are the site-wide taxonomy. */
  faq: { id: string; question: string; answer: string; category: FaqCategory | null }[];
  popularYachts: ListingSearchDoc[];
};

export type ListingPricedItem = {
  code: string;
  label: string;
  price: {
    amountMinor: number;
    currency: string;
  };
  /**
   * The top of the range when the provider keys several variants of one fee separately, else
   * null. `price` is the bottom.
   *
   * Booking Manager publishes an obligatory extra per base pair, so a boat that sells one-way
   * carries three "Boat Cleaning" ids at three prices. Exactly one applies to any given
   * charter, and which one is not known until dates and route are, so a catalogue with no
   * dates can only honestly quote the span.
   */
  priceToMinor: number | null;
  /**
   * What `price` is the price *of*, in the vendor's own words — "per person",
   * "one-way / person", "per booking". Null where the provider ships none.
   *
   * Load-bearing, not decoration: a per-person extra's catalogue price is a unit,
   * and the offer multiplies it by a quantity it chooses. Rendering every extra as
   * "per booking" told the customer €10 for a Tour the quote then charged €100 for.
   */
  priceMeasure: string | null;
  /**
   * Whether the charter base collects this on arrival, or null where the provider never said.
   *
   * Three states on purpose. The page used to assert "Pay at check-in" on every mandatory
   * extra, which on Booking Manager was backwards: it sends `payableInBase: false` for the
   * Shannon fleet's cleaning and one-way fees, and the booking sidebar right beside it counted
   * both into the prepayment. Silence is now silence rather than a guess.
   */
  payableInBase: boolean | null;
  /**
   * Charged only when the charter ends at a base other than the one it started from.
   *
   * Presenting one of these as an unconditional mandatory extra overstates every return
   * charter by its amount: this fleet's one-way fee is 155 or 185 depending on direction, and
   * the same-base charter the quote now prefers pays neither.
   */
  oneWayOnly: boolean;
  pricingType: "per_booking" | "per_week" | "pay_at_check_in";
};

/** An optional extra, plus whether the provider can price it at quote time. */
export type ListingOptionalItem = ListingPricedItem & {
  selectable: boolean;
};

export type ListingReview = {
  id: string;
  rating: number;
  author: string;
  body: string;
};

export type ListingSearchPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ListingFacetOption = {
  value: string;
  label: string;
  count?: number;
  /* Editorial fields, present only for facet groups backed by facet_media rows. */
  imageUrl?: string | null;
  cloudinaryId?: string | null;
  description?: string | null;
  /* Cheapest listing inside the group, so a card can show "from X" without a second query. */
  priceFromMinor?: number | null;
  currency?: string | null;
};

export type FacetMediaKind =
  | "country"
  | "region"
  | "location"
  | "marina"
  | "category"
  | "crew"
  | "sail_type"
  | "equipment";

export type ListingFacets = {
  destinations: string[];
  categories: string[];
  amenities: string[];
  options: {
    countries: ListingFacetOption[];
    sailingAreas: ListingFacetOption[];
    charterCompanies: ListingFacetOption[];
    marinas: ListingFacetOption[];
    durations: ListingFacetOption[];
    dateFlexibility: ListingFacetOption[];
    boatTypes: ListingFacetOption[];
    models: ListingFacetOption[];
    crews: ListingFacetOption[];
    mainsailTypes: ListingFacetOption[];
    equipment: ListingFacetOption[];
    lengthUnits: ListingFacetOption[];
    years: ListingFacetOption[];
  };
  ranges: {
    length: { min: number; max: number };
    cabins: { min: number; max: number };
    berths: { min: number; max: number };
    bathrooms: { min: number; max: number };
    price: {
      minMinor: number;
      maxMinor: number;
      currency: string;
    };
    boatAge: { min: number; max: number };
    year: { min: number; max: number };
    guestRating: { min: number; max: number };
  };
  toggles: {
    withoutAvailabilityConfirmation: boolean;
    underTemporaryBooking: boolean;
    depositInsurance: boolean;
    petsAllowed: boolean;
  };
  priceRange: {
    minMinor: number;
    maxMinor: number;
    currency: string;
  };
};

export type ListingMapMarker = {
  listingId: string;
  slug: string;
  title: string;
  lat: number;
  lng: number;
  priceFromMinor: number | null;
  currency: string | null;
  /** The offer this card's price, dates and terms describe. Null when nothing is sellable. */
  bestOfferId: string | null;
  /** How many vendors sell this hull. */
  offerCount: number;
};

export type ListingSuggestion = {
  label: string;
  /**
   * The same filter value the matching facet option carries, so a destination picked here and one
   * ticked in the filter panel are the same selection rather than two spellings of it.
   */
  value: string;
  kind: "country" | "region" | "location" | "base";
};

export type AvailabilityCalendarInput = {
  listingId: string;
  from: string;
  to: string;
};

export type AvailabilityCalendarSlot = {
  startDate: string;
  endDate: string;
  status: "available" | "option" | "occupied" | "blocked";
  price?: {
    amountMinor: number;
    currency: string;
  };
  minNights: number | null;
  checkinWeekday: number | null;
  checkoutWeekday: number | null;
  /**
   * False when the slot is our synthesis rather than the provider's word. A live
   * quote can still refuse it, so the picker must not offer it as bookable.
   */
  availabilityConfirmed: boolean;
};

export type AvailabilityCalendar = {
  listingId: string;
  slots: AvailabilityCalendarSlot[];
};

/**
 * What a listing will sell, as constraints rather than as an enumeration of offers.
 *
 * `availability_slot` answers "is this exact period on our list"; this answers "is any
 * period the visitor might ask for legal". The difference matters because the list is
 * synthesized: the sync walks one interpretation of the check-in rule and discards the
 * rest, so a listing that allows a 3-night charter on any day is published as 3-night
 * blocks every 7 days. Given the rules and the occupancy, a caller can decide a range
 * we never enumerated. See docs on `synthesizeAvailableSlots`.
 */
/** One provider's own answer about a listing: its calendar, its rules, its rates, its refusals. */
export type OfferConstraints = {
  offerId: string;
  /** The vendor code, so a caller can say who would sell it. */
  provider: string;
  /** Allowed charter shapes. Empty when the provider published none. */
  rules: {
    /** 0 Sunday to 6 Saturday, matching `listing_checkin_rule`. Null means any day. */
    checkinWeekday: number | null;
    checkoutWeekday: number | null;
    minNights: number | null;
    maxNights: number | null;
  }[];
  /**
   * Periods this provider says are taken, plus our own live checkouts. Half-open: `endDate` is
   * the turnaround day. The holds are on every offer, because a hold blocks the hull whoever
   * else lists it.
   */
  occupied: {
    startDate: string;
    endDate: string;
    status: "option" | "occupied" | "blocked";
  }[];
  /**
   * Exact periods this provider was asked to price and refused, which nothing else here can
   * express: a week can be unsold, inside an open season, and still not for sale. Matched on
   * both ends by the rules, so a refused fortnight never buries the free week inside it.
   */
  refused: { startDate: string; endDate: string }[];
  /**
   * Periods carrying a published rate. Absence is meaningful: the provider does not
   * price a season it has not opened, so a date no entry covers is not sellable yet.
   */
  priced: {
    startDate: string;
    endDate: string;
    priceMinor: number;
    currency: string;
    /** The provider priced this exact period on request, rather than us inferring it. */
    confirmed: boolean;
  }[];
  /** Periods the boat may be dropped at a different base. Null dates mean "always". */
  oneWay: {
    startDate: string | null;
    endDate: string | null;
    isOneWay: boolean;
  }[];
};

/**
 * What a listing will sell over a window, one set per offer.
 *
 * Never flattened into a single set: a yacht two vendors sell has two calendars and two sets
 * of rules, and merging them would describe a charter neither vendor would honour. The
 * combinators in `packages/api/src/lib/offer-availability.ts` answer across them, so a day is
 * offered when any offer can deliver it.
 */
export type AvailabilityConstraints = {
  listingId: string;
  window: { from: string; to: string };
  offers: OfferConstraints[];
};
