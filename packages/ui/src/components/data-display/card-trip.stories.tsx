import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Activity, Clock } from "lucide-react";

const IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='452' height='260'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'%3E%3Cstop offset='0' stop-color='%23bfe3f5'/%3E%3Cstop offset='1' stop-color='%232f80ed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='452' height='260' fill='url(%23g)'/%3E%3C/svg%3E";

const meta = {
  title: "Data Display/Cards/Trip",
  component: TripCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    image: IMG,
    title: "Amalfi Coast",
    description:
      "Discover the hidden bays of Brač, the vibrant nightlife of Hvar, and the peaceful beauty of Vis.",
    meta: [
      { label: "7 days", icon: <Clock /> },
      { label: "Easy", icon: <Activity /> },
    ],
  },
} satisfies Meta<typeof TripCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
