import { Button } from "@yacht-charter/ui/components/actions/button";
import { Calendar } from "@yacht-charter/ui/components/form/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Overlay/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="neutral">Open popover</Button>} />
      <PopoverContent className="w-64">
        <p className="text-sm font-semibold text-foreground">Popover title</p>
        <p className="text-sm text-natural-600">
          A floating surface anchored to its trigger, with 16/12 padding and an 8px gap between
          stacked children.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const Placement: Story = {
  name: "Side & alignment",
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="neutral">Above, aligned end</Button>} />
      <PopoverContent side="top" align="end" className="w-56">
        <p className="text-sm text-natural-600">
          Positioned above the trigger and aligned to its end edge.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const HostingACalendar: Story = {
  name: "Hosting a card child (Calendar)",
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="neutral">Pick dates</Button>} />
      {/* Calendar is already a card, so strip the popover's own chrome. */}
      <PopoverContent className="w-auto border-0 bg-transparent p-0 shadow-none">
        <Calendar mode="range" />
      </PopoverContent>
    </Popover>
  ),
};
