import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wifi } from "lucide-react";

const meta = {
  title: "Feedback/Notification",
  component: Notification,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    variant: { control: "select", options: ["info", "success", "warning", "error"] },
    children: { control: "text" },
  },
  args: {
    variant: "info",
    children:
      "We'll use this information to confirm your booking and coordinate with the base manager.",
  },
} satisfies Meta<typeof Notification>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    icon: <Wifi />,
    children:
      "We'll use this information to confirm your booking and coordinate with the base manager.",
  },
};

export const Success: Story = {
  args: { variant: "success", children: "Your booking is confirmed." },
};
export const Warning: Story = {
  args: { variant: "warning", children: "Your deposit is due in 3 days." },
};
export const ErrorState: Story = {
  name: "Error",
  args: { variant: "error", children: "We couldn't process your payment. Please try again." },
};
