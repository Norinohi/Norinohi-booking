import { Button } from "@yacht-charter/ui/components/actions/button";
import { TestimonialCard } from "@yacht-charter/ui/components/data-display/card-testimonial";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

/*
 * Testimonials — Figma "Main Page" section (node 605:4132). A centered "What Our Customers Say"
 * heading over two full-bleed rows of brand-50 TestimonialCards. The design offsets the second
 * row; here the rows drift in opposite directions as a slow CSS marquee (pauses on hover, and is
 * disabled under prefers-reduced-motion) with edge fades. A centered "All Reviews" link
 * (node 615:8175) closes the section. Static sample content; the link points at /yachts until a
 * dedicated reviews route exists (TODO).
 */

type Testimonial = { quote: string; author: string; location: string };

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We booked a yacht in Croatia for the first time and everything just worked. The process was simple, and the boat was exactly what we expected.",
    author: "Daniel Weber",
    location: "Germany",
  },
  {
    quote:
      "I had no sailing experience, but the platform made it easy to find a skipper and plan the whole trip. It felt like a regular holiday, just better.",
    author: "Sophie Martin",
    location: "France",
  },
  {
    quote:
      "The price transparency was the biggest surprise. We could see the full cost upfront and split it between friends — super convenient.",
    author: "James Carter",
    location: "United Kingdom",
  },
  {
    quote:
      "We compared a few yachts and found the perfect one for our group. The route suggestions were really helpful — we didn't have to plan anything.",
    author: "Luca Rossi",
    location: "Italy",
  },
  {
    quote:
      "Great selection of boats and very clear filters. We found exactly what we needed in just a few minutes.",
    author: "Anna Kowalska",
    location: "Poland",
  },
  {
    quote:
      "Everything from booking to boarding felt effortless. Clear communication, no hidden fees, and a boat that looked even better in person.",
    author: "Mark Jensen",
    location: "Denmark",
  },
];

const ROW_ONE = TESTIMONIALS;
const ROW_TWO = [...TESTIMONIALS.slice(3), ...TESTIMONIALS.slice(0, 3)];

const MARQUEE_CSS = `
@keyframes testimonials-scroll-ltr { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes testimonials-scroll-rtl { from { transform: translateX(-50%); } to { transform: translateX(0); } }
.testimonials-track { width: max-content; animation: testimonials-scroll-ltr 70s linear infinite; }
.testimonials-track-reverse { animation-name: testimonials-scroll-rtl; }
.testimonials-marquee:hover .testimonials-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .testimonials-track { animation: none; } }
`;

function MarqueeRow({ items, reverse = false }: { items: Testimonial[]; reverse?: boolean }) {
  return (
    <div className="testimonials-marquee overflow-hidden">
      <div className={cn("testimonials-track flex gap-5", reverse && "testimonials-track-reverse")}>
        {[...items, ...items].map((item, index) => (
          <TestimonialCard
            key={index}
            aria-hidden={index >= items.length || undefined}
            className="w-[452px] max-w-none shrink-0"
            quote={item.quote}
            author={item.author}
            location={item.location}
            rating={5}
          />
        ))}
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="overflow-hidden bg-background py-[60px] md:pt-[70px] md:pb-[50px] 2xl:pt-[100px] 2xl:pb-[60px]">
      <div className="mx-auto max-w-[1536px] px-4 md:px-[54px] 2xl:px-[70px]">
        <h2 className="text-center text-[32px] leading-[1.1] font-medium md:text-[50px] 2xl:text-[50px]">
          What Our Customers Say
        </h2>
      </div>

      <div className="mt-10 flex flex-col gap-5 md:mt-8 lg:mt-10 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <MarqueeRow items={ROW_ONE} />
        <MarqueeRow items={ROW_TWO} reverse />
      </div>

      <div className="mx-auto mt-10 flex max-w-[1536px] justify-center px-4 md:mt-8 lg:mt-10">
        <Button variant="neutral" size="md" nativeButton={false} render={<Link href="/yachts" />}>
          All Reviews
          <ArrowUpRight />
        </Button>
      </div>

      <style>{MARQUEE_CSS}</style>
    </section>
  );
}
