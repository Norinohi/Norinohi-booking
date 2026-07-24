import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { Menu, MenuItem } from "@yacht-charter/ui/components/overlay/menu";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";

const meta = {
  title: "Overlay/Menu Item",
  component: MenuItem,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "inline-radio", options: ["item", "search"] },
  },
  args: { variant: "item", children: "Placeholder" },
  render: (args) => (
    <div className="w-[300px]">
      <MenuItem {...args} />
    </div>
  ),
} satisfies Meta<typeof MenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Item: Story = {};

export const WithControl: Story = {
  args: { startSlot: <Checkbox /> },
};

export const SearchField: Story = {
  args: { variant: "search", startSlot: <Search />, children: "Placeholder" },
};

/** The two single-row states from the Figma "Menu Item" component (node 733:13229). */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-[300px] flex-col gap-4">
      <MenuItem startSlot={<Checkbox />}>Placeholder</MenuItem>
      <MenuItem variant="search" startSlot={<Search />}>
        Placeholder
      </MenuItem>
    </div>
  ),
};

/** The full "Menu Item" list panel (node 755:11770): search field + scrollable options. */
export const MenuPanel: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Menu className="w-[366px]">
      <MenuItem variant="search" startSlot={<Search />}>
        Placeholder
      </MenuItem>
      <ScrollArea className="h-[280px]">
        <div className="flex flex-col pr-3">
          {Array.from({ length: 10 }, (_, i) => (
            <MenuItem key={i} startSlot={<Checkbox />}>
              Placeholder
            </MenuItem>
          ))}
        </div>
      </ScrollArea>
    </Menu>
  ),
};
