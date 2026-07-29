import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@yacht-charter/ui/components/feedback/empty";
import { Sailboat } from "lucide-react";

/*
 * EmptyState — Figma "Empty State Section" (Reusable Sections, nodes 994:79342 desktop&tablet /
 * 994:79682 mobile). Thin app-level wrapper over the shared `feedback/empty` primitive with the
 * yacht-search defaults; identical layout across breakpoints, just narrower.
 */
type EmptyStateProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  media?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export default function EmptyState({
  title = "No, we couldn't find any for your filters",
  description = "Try adjusting or clearing your filters to see more yachts.",
  media,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia>{media ?? <Sailboat className="size-12 text-natural-300" />}</EmptyMedia>
        <EmptyTitle className="text-lg font-semibold">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
