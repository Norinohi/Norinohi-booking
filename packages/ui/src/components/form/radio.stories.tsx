import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Form/Radio",
  component: Radio,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: { disabled: { control: "boolean" } },
  args: { value: "a", disabled: false },
  render: (args) => (
    <RadioGroup defaultValue="a">
      <Radio {...args} />
    </RadioGroup>
  ),
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

/** A group of options, the way the Figma "Radio, checkbox, toggle group" renders them. */
export const Group: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <RadioGroup defaultValue="one" className="w-[240px]">
      {[
        { id: "one", label: "Placeholder" },
        { id: "two", label: "Placeholder" },
        { id: "three", label: "Placeholder" },
      ].map(({ id, label }) => (
        <label key={id} className="flex items-center gap-2 text-sm font-semibold">
          <Radio value={id} />
          {label}
        </label>
      ))}
    </RadioGroup>
  ),
};

/** Idle / selected / disabled. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <RadioGroup defaultValue="on" className="flex-row items-center gap-4">
      <Radio value="off" />
      <Radio value="on" />
      <Radio value="disabled" disabled />
    </RadioGroup>
  ),
};
