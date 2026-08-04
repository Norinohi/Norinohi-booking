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
  currency?: string;
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
  lengthM: string | null;
  cabins: number | null;
  berths: number | null;
  heads: number | null;
  yearBuilt: number | null;
  rating: string;
  reviewCount: number;
  mainImage: string | null;
  gallery: string[];
  amenities: string[];
  priceFromMinor: number | null;
  currency: string | null;
  availableFrom: string | null;
  availableTo: string | null;
};

export type ListingSearchResult = {
  items: ListingSearchDoc[];
  nextCursor?: string;
  pagination?: ListingSearchPagination;
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

export type ListingFacets = {
  destinations: string[];
  categories: string[];
  amenities: string[];
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
