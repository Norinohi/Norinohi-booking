import { Button } from "@yacht-charter/ui/components/actions/button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowDownRight, Star } from "lucide-react";

const meta = {
  title: "Actions/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "brand", "neutral", "subtle", "destructive", "link"],
      description: "Canonical: primary · brand · neutral · subtle. Extras: destructive · link.",
    },
    size: { control: "select", options: ["md", "sm"] },
    disabled: { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    children: "Book now",
    variant: "primary",
    size: "md",
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Primary: Story = { args: { variant: "primary" } };
export const Brand: Story = { args: { variant: "brand" } };
export const Neutral: Story = { args: { variant: "neutral" } };
export const Subtle: Story = { args: { variant: "subtle" } };

export const WithIcons: Story = {
  args: {
    children: (
      <>
        <Star />
        Book now
        <ArrowDownRight />
      </>
    ),
  },
};

const VARIANTS = ["primary", "brand", "neutral", "subtle"] as const;

export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-20 text-body-s text-muted-foreground">{variant}</span>
          <Button variant={variant}>Button</Button>
          <Button variant={variant} size="sm">
            Button
          </Button>
          <Button variant={variant} disabled>
            Button
          </Button>
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="md">Medium — 48</Button>
      <Button size="sm">Small — 32</Button>
    </div>
  ),
};
