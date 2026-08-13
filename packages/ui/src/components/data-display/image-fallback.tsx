import { cn } from "@yacht-charter/ui/lib/utils";
import { Image as ImageIcon } from "lucide-react";

/*
 * ImageFallback — the media box a card shows when a record has no image: a neutral fill with a
 * centered, muted picture glyph, so an empty tile reads as "no photo" rather than a blank panel.
 * Pass `className` to override the fill (e.g. a darker neutral behind a gradient scrim).
 */
function ImageFallback({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex size-full items-center justify-center bg-natural-50", className)}
      {...props}
    >
      <ImageIcon className="size-10 text-natural-400" />
    </div>
  );
}

export { ImageFallback };
