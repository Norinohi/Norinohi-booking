import type { CrewType } from "./crew";

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
  charterCompany?: string[];
  marina?: string[];
  boatType?: string[];
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
  operator: string;
  baseId: string;
  baseName: string;
  location: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  baseEmail: string | null;
  basePhone: string | null;
  baseWebsite: string | null;
  lengthM: string | null;
  cabins: number | null;
  berths: number | null;
  heads: number | null;
  yearBuilt: number | null;
  sailType: string | null;
  depositInsuranceIncluded: boolean;
  petsAllowed: boolean;
  rating: string;
  reviewCount: number;
  mainImage: string | null;
  gallery: string[];
  amenities: string[];
  priceFromMinor: number | null;
  currency: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  hasUnconfirmedAvailability: boolean;
  hasTemporaryBooking: boolean;
};

export type ListingSearchResult = {
  items: ListingSearchDoc[];
  nextCursor?: string;
  pagination?: ListingSearchPagination;
};

export type ListingDetail = ListingSearchDoc & {
  description: string;
  overview: { code: string; label: string; value: string }[];
  includedAmenities: { code: string; label: string }[];
  mandatoryExtras: ListingPricedItem[];
  optionalExtras: ListingPricedItem[];
  /** What the sidebar's Crew control may offer, and what each role costs. */
  crew: {
    options: CrewType[];
    roles: ListingPricedItem[];
  };
  importantInformation: {
    charterCompany: string;
    yachtPickupAddress: string;
    yachtPickup: { date: string | null; time: string | null };
    yachtDropOff: { date: string | null; time: string | null };
    cancellationPaymentPolicies: string;
    sailingLicenseRequired: string;
    pets: string;
    paymentMethodsAcceptedByCharterCompany: string[];
    marinaInformation: string;
    marinaContact: {
      name: string;
      address: string;
      email: string | null;
      phone: string | null;
      website: string | null;
    };
    map: { lat: number; lng: number };
  };
  suggestedRoute: {
    title: string;
    map: { lat: number; lng: number };
    stops: {
      day: number;
      title: string;
      description: string;
      lat: number;
      lng: number;
    }[];
  };
  reviews: ListingReview[];
  faq: { id: string; question: string; answer: string }[];
  popularYachts: ListingSearchDoc[];
};

export type ListingPricedItem = {
  code: string;
  label: string;
  price: {
    amountMinor: number;
    currency: string;
  };
  pricingType: "per_booking" | "per_week" | "pay_at_check_in";
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
};

export type ListingSuggestion = {
  label: string;
  kind: "country" | "region" | "location" | "base";
};

export type AvailabilityCalendarInput = {
  listingId: string;
  from: string;
  to: string;
  currency?: string;
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
};

export type AvailabilityCalendar = {
  listingId: string;
  slots: AvailabilityCalendarSlot[];
};
