"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

type EmblaCarouselType = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
type EmblaOptionsType = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

/*
 * Carousel — headless slider built on Embla v8 (methods are scrollTo /
 * scrollSnapList / selectedScrollSnap; the v9 goTo/snapList API is still an RC).
 * Figma pairs it with 16x4 bar indicators rather than dots — see the boat card
 * (755:2922) and the yacht gallery. Every part is opt-in, so the card composes
 * viewport + bars while the gallery adds arrows + thumbnails.
 */
type CarouselContextValue = {
  viewportRef: ReturnType<typeof useEmblaCarousel>[0];
  api: EmblaCarouselType | undefined;
  selected: number;
  snapCount: number;
  canScrollPrev: boolean;
  canScrollNext: boolean;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) throw new Error("Carousel parts must be used inside <Carousel>");
  return context;
}

function Carousel({
  options,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { options?: EmblaOptionsType }) {
  const [viewportRef, api] = useEmblaCarousel(options);
  const [selected, setSelected] = React.useState(0);
  const [snapCount, setSnapCount] = React.useState(0);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  React.useEffect(() => {
    if (!api) return;

    const sync = () => {
      setSelected(api.selectedScrollSnap());
      setSnapCount(api.scrollSnapList().length);
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };

    sync();
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api]);

  const value = React.useMemo(
    () => ({ viewportRef, api, selected, snapCount, canScrollPrev, canScrollNext }),
    [viewportRef, api, selected, snapCount, canScrollPrev, canScrollNext],
  );

  return (
    <CarouselContext.Provider value={value}>
      <div data-slot="carousel" className={cn("relative", className)} {...props}>
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselViewport({ className, children, ...props }: React.ComponentProps<"div">) {
  const { viewportRef } = useCarousel();
  return (
    <div
      ref={viewportRef}
      data-slot="carousel-viewport"
      className={cn("size-full overflow-hidden", className)}
      {...props}
    >
      <div className="flex size-full">{children}</div>
    </div>
  );
}

function CarouselSlide({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="carousel-slide"
      className={cn("relative min-w-0 shrink-0 grow-0 basis-full", className)}
      {...props}
    />
  );
}

function CarouselBars({
  className,
  barClassName,
  ...props
}: React.ComponentProps<"div"> & { barClassName?: string }) {
  const { api, selected, snapCount } = useCarousel();
  if (snapCount <= 1) return null;

  return (
    <div
      data-slot="carousel-bars"
      className={cn("flex items-center justify-center gap-1 p-1", className)}
      {...props}
    >
      {Array.from({ length: snapCount }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Go to photo ${index + 1}`}
          aria-current={index === selected || undefined}
          onClick={() => api?.scrollTo(index)}
          className={cn(
            "h-1 w-4 cursor-pointer rounded-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            index === selected ? "bg-white" : "bg-white/12 hover:bg-white/40",
            barClassName,
          )}
        />
      ))}
    </div>
  );
}

function CarouselArrow({
  direction,
  className,
  ...props
}: React.ComponentProps<"button"> & { direction: "prev" | "next" }) {
  const { api, canScrollPrev, canScrollNext } = useCarousel();
  const isPrev = direction === "prev";

  return (
    <button
      type="button"
      data-slot={`carousel-${direction}`}
      aria-label={isPrev ? "Previous photo" : "Next photo"}
      disabled={isPrev ? !canScrollPrev : !canScrollNext}
      onClick={() => (isPrev ? api?.scrollPrev() : api?.scrollNext())}
      className={cn(
        "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/80 text-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] transition-colors outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-0",
        isPrev ? "left-3" : "right-3",
        className,
      )}
      {...props}
    >
      {isPrev ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

/**
 * A second Embla instance whose slides act as controls for the main one.
 * `containScroll: "keepSnaps"` keeps every thumb reachable, and the strip
 * auto-scrolls so the active thumb never ends up off-screen.
 */
function CarouselThumbs({
  children,
  className,
  listClassName,
  itemClassName,
  ...props
}: React.ComponentProps<"div"> & {
  children: React.ReactNode[];
  /** Styles the strip that holds the thumbs — its `gap` lives here, not on the root. */
  listClassName?: string;
  /** Styles each thumb button — width (`basis-*`), radius and the inactive opacity. */
  itemClassName?: string;
}) {
  const { api, selected } = useCarousel();
  const [thumbsRef, thumbsApi] = useEmblaCarousel({
    containScroll: "keepSnaps",
    dragFree: true,
  });

  React.useEffect(() => {
    thumbsApi?.scrollTo(selected);
  }, [thumbsApi, selected]);

  return (
    <div
      ref={thumbsRef}
      data-slot="carousel-thumbs"
      className={cn("overflow-hidden", className)}
      {...props}
    >
      <div className={cn("flex gap-4", listClassName)}>
        {children.map((child, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Show photo ${index + 1}`}
            aria-current={index === selected || undefined}
            onClick={() => api?.scrollTo(index)}
            className={cn(
              "relative min-w-0 shrink-0 grow-0 basis-1/3 overflow-hidden rounded-xl outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/40",
              index === selected ? "opacity-100" : "opacity-60 hover:opacity-100",
              itemClassName,
            )}
          >
            {child}
          </button>
        ))}
      </div>
    </div>
  );
}

export {
  Carousel,
  CarouselViewport,
  CarouselSlide,
  CarouselBars,
  CarouselArrow,
  CarouselThumbs,
  useCarousel,
};
