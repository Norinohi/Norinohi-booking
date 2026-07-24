import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Form/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    defaultChecked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { defaultChecked: false, disabled: false },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithLabel: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <Checkbox defaultChecked />
      Placeholder
    </label>
  ),
};

/** Idle / checked / disabled, matching the Figma "Radio, checkbox, toggle" states. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-4">
      <Checkbox />
      <Checkbox defaultChecked />
      <Checkbox disabled />
      <Checkbox disabled defaultChecked />
    </div>
  ),
};
