import { TextField } from "@yacht-charter/ui/components/form/text-field";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eye, Search } from "lucide-react";

const meta = {
  title: "Form/Text Field",
  component: TextField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    status: { control: "select", options: ["default", "error", "success"] },
    label: { control: "text" },
    placeholder: { control: "text" },
    supportingText: { control: "text" },
    multiline: { control: "boolean" },
    disabled: { control: "boolean" },
    startIcon: { control: false },
    endIcon: { control: false },
  },
  args: {
    label: "Label",
    placeholder: "Placeholder",
    supportingText: "Supporting text",
    status: "default",
  },
  render: (args) => (
    <div className="w-[366px]">
      <TextField {...args} />
    </div>
  ),
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Filled: Story = {
  args: { defaultValue: "Placeholder" },
};

export const WithIcons: Story = {
  args: { startIcon: <Search />, endIcon: <Eye /> },
};

export const Error: Story = {
  args: { status: "error", defaultValue: "Placeholder" },
};

export const Success: Story = {
  args: { status: "success", defaultValue: "Placeholder" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Password: Story = {
  args: { type: "password", defaultValue: "password123" },
};

export const Multiline: Story = {
  args: { multiline: true },
};

/** Every state from the Figma "Text field" component (node 730:9030). */
export const AllStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid w-[720px] grid-cols-2 gap-6">
      <TextField label="Empty" placeholder="Placeholder" supportingText="Supporting text" />
      <TextField label="Filled" defaultValue="Placeholder" supportingText="Supporting text" />
      <TextField
        label="With icons"
        placeholder="Placeholder"
        supportingText="Supporting text"
        startIcon={<Search />}
        endIcon={<Eye />}
      />
      <TextField
        label="Disabled"
        placeholder="Placeholder"
        supportingText="Supporting text"
        disabled
      />
      <TextField
        label="Error"
        status="error"
        defaultValue="Placeholder"
        supportingText="Supporting text"
      />
      <TextField
        label="Positive"
        status="success"
        defaultValue="Placeholder"
        supportingText="Supporting text"
      />
      <TextField
        label="Password"
        type="password"
        defaultValue="password123"
        supportingText="Supporting text"
      />
      <TextField
        label="Big text field"
        multiline
        placeholder="Placeholder"
        supportingText="Supporting text"
      />
    </div>
  ),
};
