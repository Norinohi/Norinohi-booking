import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import type { Meta, StoryObj } from "@storybook/react-vite";

// Self-contained gradient placeholder so stories need no network image.
const IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'%3E%3Cstop offset='0' stop-color='%23bfe3f5'/%3E%3Cstop offset='1' stop-color='%232f80ed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='url(%23g)'/%3E%3C/svg%3E";

const meta = {
  title: "Data Display/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Composed: Story = {
  name: "Composed (default)",
  render: () => (
    <Card className="w-[334px]">
      <CardMedia>
        <img src={IMG} alt="" />
      </CardMedia>
      <CardContent>
        <CardTitle>Lagoon 42</CardTitle>
        <CardDescription>A roomy catamaran, perfect for families and small groups.</CardDescription>
      </CardContent>
      <CardFooter>
        <span className="text-lg font-bold text-foreground">€350</span>
        <Button variant="neutral" size="sm">
          View Details
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <Card variant="default" className="w-[220px]">
        <CardContent>
          <CardTitle>default</CardTitle>
          <CardDescription>Bordered white surface.</CardDescription>
        </CardContent>
      </Card>
      <Card variant="filled" className="w-[220px]">
        <CardContent>
          <CardTitle>filled</CardTitle>
          <CardDescription>Brand-50 wash.</CardDescription>
        </CardContent>
      </Card>
      <Card variant="ghost" className="w-[220px]">
        <CardMedia className="rounded-xl">
          <img src={IMG} alt="" />
        </CardMedia>
        <CardContent className="p-0">
          <CardTitle>ghost</CardTitle>
          <CardDescription>No frame; media rounds itself.</CardDescription>
        </CardContent>
      </Card>
    </div>
  ),
};
