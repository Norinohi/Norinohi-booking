import { TestimonialCard } from "@yacht-charter/ui/components/data-display/card-testimonial";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Data Display/Cards/Testimonial",
  component: TestimonialCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    quote:
      "“We booked a yacht in Croatia for the first time and everything just worked. The process was simple, and the boat was exactly what we expected”",
    author: "Daniel Weber",
    location: "Germany",
    rating: 5,
  },
  argTypes: { rating: { control: { type: "range", min: 0, max: 5, step: 1 } } },
} satisfies Meta<typeof TestimonialCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
