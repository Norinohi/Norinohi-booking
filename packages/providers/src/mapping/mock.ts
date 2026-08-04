import { createHash } from "node:crypto";

import { availability, catalogue } from "../mock/data";
import type { ListingSummary, RawEntity } from "../types";

type Yacht = (typeof catalogue.yachts)[number];
type Slot = (typeof availability.slots)[number];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const first = <T>(items: T[], label: string) => {
  const item = items[0];
  if (item === undefined) {
    throw new Error(`Missing required fixture item: ${label}`);
  }
  return item;
};

export function sourceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function rawEntities(): RawEntity[] {
  return [
    ...catalogue.companies.map((payload) => ({
      resourceType: "company" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.bases.map((payload) => ({
      resourceType: "base" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.builders.map((payload) => ({
      resourceType: "builder" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.models.map((payload) => ({
      resourceType: "model" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.categories.map((payload) => ({
      resourceType: "category" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.amenities.map((payload) => ({
      resourceType: "amenity" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.yachts.map((payload) => ({
      resourceType: "yacht" as const,
      externalId: payload.id,
      payload,
    })),
  ];
}

export function mapYachtToListing(yacht: Yacht): ListingSummary {
  const company = catalogue.companies.find((item) => item.id === yacht.companyId);
  const base = catalogue.bases.find((item) => item.id === yacht.baseId);
  const builder = catalogue.builders.find((item) => item.id === yacht.builderId);
  const model = catalogue.models.find((item) => item.id === yacht.modelId);
  const category = catalogue.categories.find((item) => item.id === yacht.categoryId);
  const amenities = catalogue.amenities.filter((item) => yacht.amenityIds.includes(item.id));

  if (!company || !base || !builder || !model || !category) {
    throw new Error(`Incomplete mock yacht fixture: ${yacht.id}`);
  }

  return {
    id: `ylst_${slugify(yacht.id)}`,
    slug: slugify(`${yacht.name}-${model.name}-${base.location}`),
    title: `${yacht.name} ${model.name}`,
    category: category.name,
    builder: builder.name,
    model: model.name,
    operator: company.name,
    base: {
      id: `base_${slugify(base.id)}`,
      name: base.name,
      location: base.location,
      region: base.region,
      country: base.country,
      lat: base.lat,
      lng: base.lng,
    },
    specs: {
      lengthM: yacht.lengthM,
      cabins: yacht.cabins,
      berths: yacht.berths,
      heads: yacht.heads,
      yearBuilt: yacht.yearBuilt,
    },
    rating: yacht.rating,
    reviewCount: yacht.reviewCount,
    mainImage: first(yacht.media, `${yacht.id} media`),
    gallery: yacht.media,
    amenities: amenities.map((item) => item.name),
    priceFrom: {
      amountMinor: yacht.priceFromMinor,
      currency: yacht.currency,
    },
    providerSourceId: `mock:${yacht.id}`,
  };
}

export function mapSlotToOffer(slot: Slot, guests: number) {
  const yacht = catalogue.yachts.find((item) => item.id === slot.yachtId);
  if (!yacht) {
    throw new Error(`Missing yacht for availability slot: ${slot.yachtId}`);
  }

  return {
    id: `offer_${slugify(`${slot.yachtId}-${slot.startDate}`)}`,
    listing: mapYachtToListing(yacht),
    provider: "mock" as const,
    checkIn: slot.startDate,
    checkOut: slot.endDate,
    nights: Math.round((Date.parse(slot.endDate) - Date.parse(slot.startDate)) / 86_400_000),
    guests,
    clientPrice: {
      amountMinor: slot.priceMinor,
      currency: slot.currency,
    },
    obligatoryExtras: availability.extras
      .filter((item) => item.obligatory)
      .map((item) => ({
        code: item.code,
        name: item.name,
        price: {
          amountMinor: item.priceMinor,
          currency: item.currency,
        },
      })),
    priceSourceHash: sourceHash(slot),
  };
}
