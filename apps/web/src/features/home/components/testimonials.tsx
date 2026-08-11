import { Button } from "@yacht-charter/ui/components/actions/button";
import { TestimonialCard } from "@yacht-charter/ui/components/data-display/card-testimonial";
import { cn } from "@yacht-charter/ui/lib/utils";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";

import { RISE, VIEWPORT } from "@/lib/motion";

/* Author names are proper nouns and stay in code; quote and location come from messages. */
const TESTIMONIALS = [
  { key: "weber", author: "Daniel Weber" },
  { key: "martin", author: "Sophie Martin" },
  { key: "carter", author: "James Carter" },
  { key: "rossi", author: "Luca Rossi" },
  { key: "kowalska", author: "Anna Kowalska" },
  { key: "jensen", author: "Mark Jensen" },
] as const;

type Testimonial = (typeof TESTIMONIALS)[number];

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

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: readonly Testimonial[];
  reverse?: boolean;
}) {
  const t = useTranslations("Home.Testimonials.items");

  return (
    <div className="testimonials-marquee overflow-hidden">
      <div
        className={cn(
          "testimonials-track flex gap-2 md:gap-5",
          reverse && "testimonials-track-reverse",
        )}
      >
        {[...items, ...items].map((item, index) => (
          <TestimonialCard
            key={index}
            aria-hidden={index >= items.length || undefined}
            className="w-89.5 max-w-none shrink-0 md:w-113"
            quote={t(`${item.key}.quote`)}
            author={item.author}
            location={t(`${item.key}.location`)}
            rating={5}
          />
        ))}
      </div>
    </div>
  );
}

export default function Testimonials() {
  const t = useTranslations("Home.Testimonials");

  return (
    <section className="overflow-hidden bg-background pt-10 pb-8 md:pt-17.5 md:pb-12.5 xl:pt-25 xl:pb-15">
      <div className="mx-auto max-w-384 px-4 md:px-13.5 xl:px-17.5">
        <motion.h2
          variants={RISE}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
          className="text-center text-[40px] leading-[1.1] font-medium md:text-[50px]"
        >
          {t("heading")}
        </motion.h2>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:gap-5 lg:mt-10 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <MarqueeRow items={ROW_ONE} />
        <MarqueeRow items={ROW_TWO} reverse />
      </div>

      <div className="mx-auto mt-8 flex max-w-384 justify-center px-4 lg:mt-10">
        <Button variant="neutral" size="md" className="w-full md:w-auto">
          Coming Soon
        </Button>
      </div>

      <style>{MARQUEE_CSS}</style>
    </section>
  );
}
