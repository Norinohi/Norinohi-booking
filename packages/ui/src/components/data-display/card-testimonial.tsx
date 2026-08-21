"use client";

import { Card, CardContent } from "@yacht-charter/ui/components/data-display/card";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useUiLabels } from "@yacht-charter/ui/components/ui-labels";
import { Star } from "lucide-react";

/*
 * TestimonialCard — Figma "card/testimonial" (614:8027). A brand-50 wash card: a star row,
 * the quote, then the author pinned to the bottom.
 */
type TestimonialCardProps = React.ComponentProps<"div"> & {
  quote: React.ReactNode;
  author: React.ReactNode;
  location?: React.ReactNode;
  rating?: number;
};

function TestimonialCard({
  quote,
  author,
  location,
  rating = 5,
  className,
  ...props
}: TestimonialCardProps) {
  const labels = useUiLabels();
  return (
    <Card variant="filled" className={cn("w-[452px] max-w-full", className)} {...props}>
      <CardContent className="min-h-[300px] gap-4 p-6">
        <div role="img" className="flex gap-1" aria-label={labels.rating(rating, 5)}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={cn(
                "size-4",
                i < rating ? "fill-brand text-brand" : "fill-natural-200 text-natural-200",
              )}
            />
          ))}
        </div>
        <p className="text-xl leading-[1.4] text-foreground">{quote}</p>
        <div className="mt-auto flex flex-col gap-0.5">
          <span className="text-2xl font-semibold text-foreground">{author}</span>
          {location && <span className="text-sm text-natural-300">{location}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export { TestimonialCard };
