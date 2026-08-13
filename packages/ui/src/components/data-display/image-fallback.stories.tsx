import { ImageFallback } from "@yacht-charter/ui/components/data-display/image-fallback";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Data Display/Image Fallback",
  component: ImageFallback,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ImageFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The media box a card shows when a record has no image: neutral fill, centered picture glyph. */
export const Default: Story = {
  render: (args) => (
    <div className="h-56 w-84 overflow-hidden rounded-xl">
      <ImageFallback {...args} />
    </div>
  ),
};

/** Darker fill, used behind a gradient scrim (e.g. the destination card). */
export const DarkFill: Story = {
  render: (args) => (
    <div className="h-75 w-100 overflow-hidden rounded-xl">
      <ImageFallback {...args} className="bg-natural-200" />
    </div>
  ),
};
