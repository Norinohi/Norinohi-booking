import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableCellCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@yacht-charter/ui/components/navigation/pagination";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock } from "lucide-react";

const meta = {
  title: "Data Display/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const columns = ["Yacht", "Type", "Length", "Guests", "Status"];

export const Default: Story = {
  render: () => (
    <div className="w-[720px]">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Serenity</TableCell>
            <TableCell>Catamaran</TableCell>
            <TableCell>24 m</TableCell>
            <TableCell>8</TableCell>
            <TableCell>
              <Chip variant="success">Available</Chip>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              Blue Horizon
              <TableCellCaption>Built 2021</TableCellCaption>
            </TableCell>
            <TableCell>Sailing yacht</TableCell>
            <TableCell>31 m</TableCell>
            <TableCell>10</TableCell>
            <TableCell>
              <Chip variant="warning">
                <Clock />7 days
              </Chip>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Odyssey</TableCell>
            <TableCell>Motor yacht</TableCell>
            <TableCell>42 m</TableCell>
            <TableCell>12</TableCell>
            <TableCell>
              <Chip variant="error">Booked</Chip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="flex justify-center pt-3">
        <Pagination>
          <PaginationPrevious />
          <PaginationItem active>1</PaginationItem>
          <PaginationItem>2</PaginationItem>
          <PaginationItem>3</PaginationItem>
          <PaginationEllipsis />
          <PaginationItem>15</PaginationItem>
          <PaginationNext />
        </Pagination>
      </div>
    </div>
  ),
};

/** The cell variants from the Figma "Table Cell" (node 853:55342): plain text, caption, badge. */
export const CellVariants: Story = {
  render: () => (
    <div className="w-[420px]">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Text cell</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              Text cell
              <TableCellCaption>Supporting caption</TableCellCaption>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Chip variant="brand">
                <Clock />7 days
              </Chip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
};
