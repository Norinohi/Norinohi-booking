import { Button } from "@yacht-charter/ui/components/actions/button";
import { NotificationToast } from "@yacht-charter/ui/components/feedback/notification-toast";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Feedback/NotificationToast",
  component: NotificationToast,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { title: "Title", onClose: () => {} },
} satisfies Meta<typeof NotificationToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};

export const WithMessage: Story = {
  args: { title: "Saved", description: "Message" },
};

export const WithAction: Story = {
  args: {
    title: "Saved to wishlist",
    action: (
      <Button variant="brand" size="sm">
        View
      </Button>
    ),
  },
};
