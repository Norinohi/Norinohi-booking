import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heart, Star } from "lucide-react";

const meta = {
  title: "Actions/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["primary", "neutral", "subtle"] },
    size: { control: "select", options: ["md", "sm"] },
    disabled: { control: "boolean" },
  },
  args: {
    variant: "primary",
    size: "md",
    disabled: false,
    "aria-label": "Favourite",
    children: <Star />,
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const VARIANTS = ["primary", "neutral", "subtle"] as const;

export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-20 text-body-s text-muted-foreground">{variant}</span>
          <IconButton variant={variant} size="md" aria-label="Favourite">
            <Heart />
          </IconButton>
          <IconButton variant={variant} size="sm" aria-label="Favourite">
            <Heart />
          </IconButton>
          <IconButton variant={variant} size="md" disabled aria-label="Favourite">
            <Heart />
          </IconButton>
        </div>
      ))}
    </div>
  ),
};
