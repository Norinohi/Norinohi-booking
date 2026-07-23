import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock, X } from "lucide-react";

const meta = {
  title: "Data Display/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "select", options: ["brand", "neutral", "success", "warning", "error"] },
    children: { control: "text" },
  },
  args: { variant: "brand", children: "7 days" },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Clock />7 days
      </>
    ),
  },
};

export const Removable: Story = {
  args: {
    children: (
      <>
        Catamaran
        <X />
      </>
    ),
  },
};

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Chip variant="brand">Brand</Chip>
      <Chip variant="neutral">Neutral</Chip>
      <Chip variant="success">Success</Chip>
      <Chip variant="warning">Warning</Chip>
      <Chip variant="error">Error</Chip>
    </div>
  ),
};
