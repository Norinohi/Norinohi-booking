/*
 * Tailwind's default breakpoints, in rem, which is what `globals.css` leaves in place: the theme
 * declares no `--breakpoint-*` of its own. Keep the two in step if one is ever added there.
 */
export const BREAKPOINTS = {
  sm: 40,
  md: 48,
  lg: 64,
  xl: 80,
  "2xl": 96,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** The media query behind the Tailwind variant of the same name, `md:` → `(width >= 48rem)`. */
export function breakpointQuery(breakpoint: Breakpoint): string {
  return `(width >= ${BREAKPOINTS[breakpoint]}rem)`;
}
