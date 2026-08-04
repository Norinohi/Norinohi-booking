import {
  Pagination,
  PaginationControl,
  PaginationDots,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@yacht-charter/ui/components/navigation/pagination";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

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

/** What pages actually import: pass `page` / `pageSize` / `total` and it does the rest. */
export const Control: Story = {
  render: function Render() {
    const [page, setPage] = useState(1);
    return (
      <div className="w-[700px]">
        <PaginationControl page={page} pageSize={7} total={320} onPageChange={setPage} />
      </div>
    );
  },
};

/** The window keeps a stable slot count — page through it and the row never reflows. */
export const ControlWindows: Story = {
  render: () => (
    <div className="flex w-[700px] flex-col gap-4">
      {[1, 3, 22, 44, 46].map((page) => (
        <PaginationControl
          key={page}
          page={page}
          pageSize={7}
          total={320}
          onPageChange={() => {}}
        />
      ))}
    </div>
  ),
};

/** Few pages, custom summary text, and no summary at all. */
export const ControlVariants: Story = {
  render: () => (
    <div className="flex w-[700px] flex-col gap-4">
      <PaginationControl page={2} pageSize={10} total={40} onPageChange={() => {}} />
      <PaginationControl
        page={2}
        pageSize={12}
        total={96}
        onPageChange={() => {}}
        summary={({ from, to, total }) => `${from}–${to} of ${total} yachts`}
      />
      <PaginationControl page={2} pageCount={8} onPageChange={() => {}} />
    </div>
  ),
};
