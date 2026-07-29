import { Button } from "@yacht-charter/ui/components/actions/button";
import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import { Activity, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";

/*
 * SailingRoutes — Figma "Main Page" › Popular Sailing Routes (node 605:3957). A centered H2 over
 * three TripCards (photo, title, blurb, duration/difficulty chips and an "Explore Route" action)
 * with a centered "All Routes" CTA below. Static content reusing the design-system TripCard; the
 * per-card "Explore Route" action is left unwired until route detail pages exist (see TODO).
 */
type Route = {
  image: string;
  imageAlt: string;
  title: string;
  description: string;
  days: string;
  level: string;
};

const ROUTES: Route[] = [
  {
    image: "/assets/home/sailing-routes/dalmatian-coast.webp",
    imageAlt: "Sailing yacht anchored in a forested Dalmatian bay",
    title: "Dalmatian Coast",
    description:
      "Discover the hidden bays of Brač, the vibrant nightlife of Hvar, and the peaceful beauty of Vis.",
    days: "7 days",
    level: "Easy",
  },
  {
    image: "/assets/home/sailing-routes/greek-cyclades.webp",
    imageAlt: "Whitewashed chapel above a Greek island cove",
    title: "Greek Cyclades",
    description:
      "Sail through the heart of the Aegean, from the cosmopolitan Mykonos to the breathtaking Santorini.",
    days: "5 days",
    level: "Advanced",
  },
  {
    image: "/assets/home/sailing-routes/amalfi-coast.webp",
    imageAlt: "Positano cathedral dome above the Amalfi Coast",
    title: "Amalfi Coast",
    description:
      "Cruise past Positano's cliffs and Capri's grottoes along Italy's most glamorous shoreline.",
    days: "6 days",
    level: "Moderate",
  },
];

export default function SailingRoutes() {
  return (
    <section className="w-full">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-10 px-4 py-[60px] md:gap-8 md:px-[54px] md:pt-[70px] md:pb-[69px] lg:gap-10 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[100px]">
        <h2 className="text-h2 text-center text-foreground">Popular Sailing Routes</h2>

        <div className="grid grid-cols-1 items-start gap-5 md:gap-8 lg:grid-cols-3 lg:gap-5">
          {ROUTES.map((route, i) => (
            <TripCard
              key={route.title}
              image={route.image}
              imageAlt={route.imageAlt}
              title={route.title}
              description={route.description}
              meta={[
                { label: route.days, icon: <Clock /> },
                { label: route.level, icon: <Activity /> },
              ]}
              className="w-full"
              // Tablet mockup (953:207173) inflates card content with uneven trailing
              // whitespace: outer cards 417px, middle 393px. Reserve description height to
              // reproduce it (ghost card's natural height is ~383). Tablet-only — reset at lg
              // where the row goes 3-up. Revisit once real route copy lands.
              descriptionClassName={
                i === 1 ? "md:min-h-[55px] lg:min-h-0" : "md:min-h-[79px] lg:min-h-0"
              }
            />
          ))}
        </div>

        <div className="flex justify-center">
          <Button variant="neutral" size="md" nativeButton={false} render={<Link href="/yachts" />}>
            All Routes
            <ArrowUpRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
