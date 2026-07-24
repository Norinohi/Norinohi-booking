import { Slider } from "@yacht-charter/ui/components/form/slider";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Form/Slider",
  component: Slider,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    label: { control: "text" },
    showValue: { control: "boolean" },
    disabled: { control: "boolean" },
    min: { control: "number" },
    max: { control: "number" },
    step: { control: "number" },
  },
  args: { defaultValue: 40, min: 0, max: 100, step: 1 },
  render: (args) => (
    <div className="w-[302px]">
      <Slider {...args} />
    </div>
  ),
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithLabel: Story = {
  args: { label: "Label", showValue: true, defaultValue: 50 },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 50 },
};

/** The five progress steps from the Figma "Slider" component (node 734:6587). */
export const Progress: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-[302px] flex-col gap-6">
      {[0, 25, 50, 75, 100].map((value) => (
        <Slider key={value} defaultValue={value} label={`${value}%`} showValue />
      ))}
    </div>
  ),
};
