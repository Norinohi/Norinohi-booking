import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";

/*
 * BoatTypes — Figma "Main Page" › Choose Your Boat Type (node 530:3157). A centered H2 over a
 * 4-up row of boat-type tiles (rounded photo + title + short blurb). Static content; the cards
 * reuse the design-system BoatCard so the look matches 1-to-1. Below xl the row wraps to 2-up,
 * then stacks on mobile.
 */
const BOAT_TYPES: { image: string; imageAlt: string; title: string; description: string }[] = [
  {
    image: "/assets/home/boat-types/catamaran.webp",
    imageAlt: "Catamaran sailing past a green island in turquoise water",
    title: "Catamaran",
    description: "Stable, spacious, perfect for groups and families wanting maximum comfort.",
  },
  {
    image: "/assets/home/boat-types/sailing-yacht.webp",
    imageAlt: "Sailing yacht under full sail on the open sea",
    title: "Sailing yacht",
    description: "The authentic experience. Ideal for those who love the art of sailing.",
  },
  {
    image: "/assets/home/boat-types/motor-yacht.webp",
    imageAlt: "White motor yacht cruising at speed",
    title: "Motor yacht",
    description: "Fast and luxurious. Cover more ground and arrive in absolute style.",
  },
  {
    image: "/assets/home/boat-types/luxury-yacht.webp",
    imageAlt: "Superyacht at anchor at sunset",
    title: "Luxury yacht",
    description: "Fully crewed floating villas for the ultimate bespoke holiday experience.",
  },
];

export default function BoatTypes() {
  return (
    <section className="w-full">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-8 px-4 py-[60px] md:px-[54px] md:pt-[70px] md:pb-[49px] 2xl:gap-10 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <h2 className="text-h2 text-center text-foreground">Choose Your Boat Type</h2>

        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
          {BOAT_TYPES.map((boat) => (
            <BoatCard
              key={boat.title}
              image={boat.image}
              imageAlt={boat.imageAlt}
              title={boat.title}
              description={boat.description}
              className="w-full"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
