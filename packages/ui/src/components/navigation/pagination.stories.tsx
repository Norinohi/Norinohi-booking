import {
  Pagination,
  PaginationDots,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@yacht-charter/ui/components/navigation/pagination";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Navigation/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Pagination>
      <PaginationPrevious />
      <PaginationItem active>1</PaginationItem>
      <PaginationItem>2</PaginationItem>
      <PaginationItem>3</PaginationItem>
      <PaginationItem>4</PaginationItem>
      <PaginationItem>5</PaginationItem>
      <PaginationEllipsis />
      <PaginationItem>15</PaginationItem>
      <PaginationNext />
    </Pagination>
  ),
};

/** Item states from the Figma "Pagination Item" (node 755:4492): default, active, disabled. */
export const ItemStates: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <PaginationItem>1</PaginationItem>
      <PaginationItem active>1</PaginationItem>
      <PaginationPrevious />
      <PaginationEllipsis />
      <PaginationNext disabled />
    </div>
  ),
};

/** Compact mobile indicator — Figma "pagination / Dots" (node 736:8696). */
export const Dots: Story = {
  render: () => <PaginationDots count={5} active={1} />,
};
