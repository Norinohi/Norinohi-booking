import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import type { Meta, StoryObj } from "@storybook/react-vite";

const IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'%3E%3Cstop offset='0' stop-color='%23bfe3f5'/%3E%3Cstop offset='1' stop-color='%232f80ed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='url(%23g)'/%3E%3C/svg%3E";

const meta = {
  title: "Data Display/Cards/Boat",
  component: BoatCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    image: IMG,
    title: "Catamaran",
    description: "Stable, spacious, perfect for groups and families wanting maximum comfort.",
  },
} satisfies Meta<typeof BoatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No image on the record — the media box falls back to a neutral tile with a picture glyph. */
export const NoImage: Story = { args: { image: undefined } };

/** Image URL that fails to load — the img's error event swaps in the same fallback tile. */
export const BrokenImage: Story = { args: { image: "/__broken-image.png" } };
