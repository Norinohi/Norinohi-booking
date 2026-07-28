import { Sun, Wifi, Wrench } from "lucide-react";

import type { BoatCardProps } from "../components/boat-card";

export const SAMPLE_BOAT: Omit<BoatCardProps, "className"> = {
  images: [
    "/assets/yachts/lagoon-42.jpg",
    "/assets/yachts/lagoon-42.jpg",
    "/assets/yachts/lagoon-42.jpg",
    "/assets/yachts/lagoon-42.jpg",
    "/assets/yachts/lagoon-42.jpg",
  ],
  imageAlt: "Lagoon 42 moored in Dubrovnik",
  badges: [{ label: "Best for families" }, { label: "Best value" }, { label: "15% OFF", solid: true }],
  location: "ACI Marina Dubrovnik, Dubrovnik, Croatia",
  name: "Lagoon 42",
  rating: "5.9",
  charterType: "Bareboat",
  crew: "Full crew",
  specs: [
    { label: "Year", value: "2016" },
    { label: "People", value: "12" },
    { label: "Toilets", value: "2" },
    { label: "Baths", value: "2" },
    { label: "Mainsail type", value: "Batten mainsail" },
    { label: "Cabins", value: "4" },
    { label: "Length", value: "2,544 hp" },
  ],
  amenities: [
    { icon: <Wifi />, label: "Free Wi-Fi" },
    { icon: <Sun />, label: "3 Sun Panels" },
    { icon: <Wrench />, label: "Free Standup Paddle" },
  ],
  stats: ["3 booked this month", "42 people viewed today"],
  start: { date: "7 July, 2026", time: "17:00" },
  end: { date: "25 July, 2026", time: "22:00" },
  priceLabel: "Price for 7 days",
  price: "€5,700",
  perPerson: "~ €600 for person",
  prepayment: "Booking prepayment: €1,400",
};
