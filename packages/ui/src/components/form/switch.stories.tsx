import { Switch } from "@yacht-charter/ui/components/form/switch";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Form/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    defaultChecked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { defaultChecked: false, disabled: false },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const On: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithLabel: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <Switch defaultChecked />
      Placeholder
    </label>
  ),
};

/** Off / on / disabled, matching the Figma toggle states. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-4">
      <Switch />
      <Switch defaultChecked />
      <Switch disabled />
      <Switch disabled defaultChecked />
    </div>
  ),
};
