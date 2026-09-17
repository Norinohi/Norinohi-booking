import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@yacht-charter/ui/components/overlay/sheet";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Overlay/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="brand">Open sheet</Button>} />
      <SheetContent showClose showHandle>
        <SheetBody>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Swipe down or press the X to close.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose render={<Button variant="brand">Apply</Button>} />
            <SheetClose render={<Button variant="neutral">Cancel</Button>} />
          </SheetFooter>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};

export const Right: Story = {
  render: () => (
    <Sheet side="right">
      <SheetTrigger render={<Button variant="neutral">Open side sheet</Button>} />
      <SheetContent showClose>
        <SheetBody>
          <SheetHeader className="text-left">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Swipe right to close.</SheetDescription>
          </SheetHeader>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};
