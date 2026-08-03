"use client";

import { useFormatter, useTranslations } from "next-intl";

import type {
  BoatCardBadge,
  BoatCardProps,
  BoatCardSpec,
} from "@/components/shared/data-display/boat-card";
import type { MapBoatCardProps } from "../components/map/map-boat-card";
import {
  AMENITY_ICONS,
  type AmenityKey,
  DISCOUNT_ICON,
  type SampleBoat,
  type SampleSpec,
} from "../lib/sample-boats";

type CardText = Pick<
  BoatCardProps,
  | "imageAlt"
  | "badges"
  | "charterType"
  | "crew"
  | "priceLabel"
  | "price"
  | "perPerson"
  | "prepayment"
>;

/** Turns the value-only catalogue into the display strings both boat cards expect. */
export function useBoatCards() {
  const t = useTranslations("Common.boatCard");
  const format = useFormatter();

  function specs(spec: SampleSpec): BoatCardSpec[] {
    return [
      { label: t("specs.year"), value: String(spec.year) },
      { label: t("specs.people"), value: String(spec.people) },
      { label: t("specs.toilets"), value: String(spec.toilets) },
      { label: t("specs.baths"), value: String(spec.baths) },
      { label: t("specs.mainsail"), value: spec.mainsail ?? t("battenMainsail") },
      { label: t("specs.cabins"), value: String(spec.cabins) },
      { label: t("specs.length"), value: spec.length },
    ];
  }

  function amenities(keys: AmenityKey[] | undefined) {
    return keys?.map((key) => ({ icon: AMENITY_ICONS[key], label: t(`amenities.${key}`) }));
  }

  function badges(boat: SampleBoat): BoatCardBadge[] | undefined {
    return boat.badges?.map((badge) =>
      typeof badge === "string"
        ? { label: t(`badges.${badge}`) }
        : {
            label: t("badges.discount", { percent: badge.discount }),
            icon: DISCOUNT_ICON,
            solid: true,
          },
    );
  }

  function text(boat: SampleBoat): CardText {
    return {
      imageAlt: t("imageAlt", { name: boat.name, marina: boat.marina.name }),
      badges: badges(boat),
      charterType: t(`charterTypes.${boat.charterType}`),
      crew: t(`crews.${boat.crew}`),
      priceLabel: t("priceFor", { days: boat.days }),
      price: format.number(boat.price, "eur"),
      perPerson: t(boat.perPersonApprox ? "perPersonApprox" : "perPerson", {
        price: format.number(boat.perPerson, "eur"),
      }),
      prepayment: t("prepayment", { amount: format.number(boat.prepayment, "eur") }),
    };
  }

  function toSearchCard(boat: SampleBoat): BoatCardProps & { id: string } {
    return {
      id: boat.id,
      images: boat.images,
      marina: boat.marina,
      name: boat.name,
      rating: boat.rating,
      specs: specs(boat.spec),
      amenities: amenities(boat.amenities),
      stats: boat.stats
        ? [
            t("stats.booked", { count: boat.stats.booked }),
            t("stats.viewed", { count: boat.stats.viewed }),
          ]
        : undefined,
      start: boat.start,
      end: boat.end,
      timeZone: boat.timeZone,
      ...text(boat),
    };
  }

  function toMapCard(boat: SampleBoat): MapBoatCardProps & { id: string } {
    return {
      id: boat.id,
      images: boat.images,
      marina: boat.marina,
      name: boat.name,
      rating: boat.rating,
      ...text(boat),
    };
  }

  return { toSearchCard, toMapCard };
}
