import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const meta = {
  title: "Form/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  render: () => (
    <div className="flex w-[200px] flex-col gap-1.5">
      <span className="text-sm font-semibold capitalize">Label</span>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Placeholder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">Placeholder</SelectItem>
          <SelectItem value="two">Placeholder</SelectItem>
          <SelectItem value="three">Placeholder</SelectItem>
          <SelectItem value="four">Placeholder</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  render: () => (
    <div className="flex w-[200px] flex-col gap-1.5">
      <span className="text-sm font-semibold capitalize">Label</span>
      <Select defaultValue="two">
        <SelectTrigger>
          <SelectValue placeholder="Placeholder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">Catamaran</SelectItem>
          <SelectItem value="two">Sailing yacht</SelectItem>
          <SelectItem value="three">Motor yacht</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

/**
 * `clearable` layers a reset button over the trigger. It defaults to `false` here —
 * a single select usually must hold a value — so the caller decides what "cleared"
 * means by supplying `onClear`.
 */
export const Clearable: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | null>("two");
    return (
      <div className="flex w-[200px] flex-col gap-1.5">
        <span className="text-sm font-semibold">Duration</span>
        <Select value={value} onValueChange={(next) => setValue(next as string | null)}>
          <SelectTrigger
            clearable={value !== null}
            clearLabel="Clear duration"
            onClear={() => setValue(null)}
          >
            <SelectValue placeholder="Any duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">3 days</SelectItem>
            <SelectItem value="two">7 days</SelectItem>
            <SelectItem value="three">14 days</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-natural-500">value: {value ?? "null"}</span>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-[200px]">
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Placeholder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">Placeholder</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};
