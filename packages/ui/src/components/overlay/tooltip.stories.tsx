import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Overlay/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <TooltipProvider delay={0}>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="neutral">Hover me</Button>} />
      <TooltipContent>This is a tooltip example</TooltipContent>
    </Tooltip>
  ),
};

export const Open: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger render={<Button variant="neutral">See how it works</Button>} />
      <TooltipContent side="top">This is a tooltip example</TooltipContent>
    </Tooltip>
  ),
};
