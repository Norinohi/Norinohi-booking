import { ImageWithFallback } from "@yacht-charter/ui/components/data-display/image-with-fallback";
import type { Meta, StoryObj } from "@storybook/react-vite";

const IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%232f80ed'/%3E%3C/svg%3E";

const meta = {
  title: "Data Display/Image With Fallback",
  component: ImageWithFallback,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { className: "size-full object-cover", alt: "" },
  decorators: [
    (Story) => (
      <div className="h-56 w-84 overflow-hidden rounded-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageWithFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A src that loads renders the image. */
export const Loads: Story = { args: { src: IMG } };

/** A src that fails to load swaps to the fallback tile on the img's error event. */
export const BrokenSrc: Story = { args: { src: "/__broken-image.png" } };
