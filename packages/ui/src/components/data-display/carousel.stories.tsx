import {
  Carousel,
  CarouselArrow,
  CarouselBars,
  CarouselSlide,
  CarouselThumbs,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Data Display/Carousel",
  component: Carousel,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

const TONES = [
  "bg-brand",
  "bg-brand-hover",
  "bg-natural-600",
  "bg-positive-600",
  "bg-warning-500",
  "bg-error-600",
  "bg-natural-400",
  "bg-natural-800",
];

function Photo({ index, className }: { index: number; className?: string }) {
  return (
    <div
      className={`flex size-full items-center justify-center text-2xl font-bold text-white ${TONES[index % TONES.length]} ${className ?? ""}`}
    >
      {index + 1}
    </div>
  );
}

/** How the search result card uses it: swipe plus the 16x4 bar indicators. */
export const CardGallery: Story = {
  name: "Card — bars only",
  render: () => (
    <Carousel className="h-[256px] w-[452px] overflow-hidden rounded-2xl">
      <CarouselViewport>
        {Array.from({ length: 8 }, (_, index) => (
          <CarouselSlide key={index}>
            <Photo index={index} />
          </CarouselSlide>
        ))}
      </CarouselViewport>
      <CarouselBars className="absolute inset-x-0 bottom-4" />
    </Carousel>
  ),
};

/** The yacht detail page: arrows over the photo and a synced thumbnail strip. */
export const DetailGallery: Story = {
  name: "Detail — arrows + thumbnails",
  render: () => (
    <Carousel className="w-[900px]">
      <div className="relative h-[340px] overflow-hidden rounded-2xl">
        <CarouselViewport>
          {Array.from({ length: 8 }, (_, index) => (
            <CarouselSlide key={index}>
              <Photo index={index} />
            </CarouselSlide>
          ))}
        </CarouselViewport>
        <CarouselArrow direction="prev" />
        <CarouselArrow direction="next" />
        <CarouselBars className="absolute inset-x-0 bottom-4" />
      </div>
      <CarouselThumbs className="mt-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-[120px]">
            <Photo index={index} />
          </div>
        ))}
      </CarouselThumbs>
    </Carousel>
  ),
};

export const SingleSlide: Story = {
  name: "One photo (bars hidden)",
  render: () => (
    <Carousel className="h-[256px] w-[452px] overflow-hidden rounded-2xl">
      <CarouselViewport>
        <CarouselSlide>
          <Photo index={0} />
        </CarouselSlide>
      </CarouselViewport>
      <CarouselBars className="absolute inset-x-0 bottom-4" />
    </Carousel>
  ),
};
