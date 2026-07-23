import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@yacht-charter/ui/components/overlay/dialog";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock } from "lucide-react";

import declareIncidentIllustration from "./assets/declare-incident.png";

const meta = {
  title: "Overlay/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function DeclareIncident() {
  return (
    <DialogContent showClose>
      <img src={declareIncidentIllustration} alt="" className="size-[70px]" />
      <DialogHeader>
        <Chip>
          <Clock />7 days
        </Chip>
        <DialogTitle>Declare Incident?</DialogTitle>
        <DialogDescription>
          This will send a full-screen alert to selected classes and start the incident timer.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="brand">Button</Button>
        <DialogClose render={<Button variant="neutral">Cancel</Button>} />
      </DialogFooter>
    </DialogContent>
  );
}

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="brand">Declare incident</Button>} />
      <DeclareIncident />
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger render={<Button variant="brand">Declare incident</Button>} />
      <DeclareIncident />
    </Dialog>
  ),
};
