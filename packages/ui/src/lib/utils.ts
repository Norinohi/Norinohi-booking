import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* The `--shadow-*` tokens from `globals.css`. Unlisted, `shadow-card` is taken for a shadow colour
   and survives next to a `shadow-none` passed in to override it. */
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["card", "popover", "dialog", "brand-glow"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
