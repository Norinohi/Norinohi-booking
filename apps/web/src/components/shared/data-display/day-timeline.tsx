"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

export type TimelineDay = { title: string; text: string | null };

type Progress = ReturnType<typeof useTransform<number, number>>;

/* One second per leg reads as travel rather than a page effect; seven stops take six. */
const SECONDS_PER_DAY = 1;

export interface DayTimelineProps {
  /** One list per column; a single column is `[days]`. */
  columns: TimelineDay[][];
  /** Smaller type and tighter rows, for a side panel rather than a page section. */
  compact?: boolean;
  /**
   * Numbers the days inside their dots, in the green of the routes map's own markers, so a day in
   * the panel and its dot on the map are plainly the same thing.
   */
  numbered?: boolean;
  /** Makes each day pressable, given its position across all columns. */
  onSelect?: (index: number) => void;
}

/*
 * An itinerary that plays itself: once the list scrolls into view the line runs from day 1 to the
 * last day on a clock, not on the scroll position, like the drawing on the listing page's map
 * still. One progress covers every column, so the left one fills before the right rather than
 * both together, and each stop reads the slice of the progress that is its own.
 *
 * Remounting it (a new `key`) plays it again, which is what a different route should do.
 */
export default function DayTimeline({
  columns,
  compact = false,
  numbered = false,
  onSelect,
}: DayTimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const total = columns.reduce((sum, column) => sum + column.length, 0);

  const progress = useMotionValue(0);
  const inView = useInView(ref, { once: true, margin: "0px 0px -100px 0px" });

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      progress.set(1);
      return;
    }

    const controls = animate(progress, 1, {
      duration: (total - 1) * SECONDS_PER_DAY,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [inView, progress, reduced, total]);

  let offset = 0;
  return (
    <div
      ref={ref}
      className={cn("flex flex-col", compact ? "gap-0" : "gap-10 pt-3 md:flex-row md:items-start")}
    >
      {columns.map((column, index) => {
        const first = offset;
        offset += column.length;
        return (
          <ol key={index} className="flex min-w-0 flex-1 flex-col">
            {column.map((day, row) => (
              <DayItem
                key={`${first + row}-${day.title}`}
                day={day}
                position={first + row}
                total={total}
                isFirst={row === 0}
                isLast={row === column.length - 1}
                progress={progress}
                compact={compact}
                numbered={numbered}
                onSelect={onSelect ? () => onSelect(first + row) : undefined}
              />
            ))}
          </ol>
        );
      })}
    </div>
  );
}

function DayItem({
  day,
  position,
  total,
  isFirst,
  isLast,
  progress,
  compact,
  numbered,
  onSelect,
}: {
  day: TimelineDay;
  position: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  progress: Progress;
  compact: boolean;
  numbered: boolean;
  onSelect?: () => void;
}) {
  const span = Math.max(total - 1, 1);
  const start = position / span;
  const end = Math.min((position + 1) / span, 1);

  // The stop fills just as the line reaches it; the first one is filled from the start.
  const dotOpacity = useTransform(progress, [Math.max(start - 0.08, 0), start], [0, 1]);
  const fillScale = useTransform(progress, [start, end], [0, 1]);
  /* Grown rather than scaled: a scaled dotted border stretches its dots into dashes. */
  const fillHeight = useTransform(fillScale, (scale) => `${scale * 100}%`);
  /* The number turns white as its dot fills, which is the same moment the line reaches the day. */
  const numberColour = useTransform(dotOpacity, (shown) =>
    shown > 0.5 ? "var(--color-white)" : "var(--color-positive-700)",
  );

  /* Headings where the day stands alone; a button may only hold phrasing content. */
  const Title = onSelect ? "span" : "h3";
  const Text = onSelect ? "span" : "p";
  const body = (
    <>
      <Title
        className={cn(
          "font-bold text-foreground",
          compact ? "text-sm leading-5" : "text-xl leading-6.5",
        )}
      >
        {day.title}
      </Title>
      {day.text ? (
        <Text
          className={cn(
            compact
              ? "text-xs leading-4.5 text-natural-500"
              : "text-base leading-5.5 text-foreground",
          )}
        >
          {day.text}
        </Text>
      ) : null}
    </>
  );
  const bodyClass = cn(
    "flex min-w-0 flex-1 flex-col",
    compact ? "gap-0.5" : "gap-1.5",
    !isLast && (compact ? "pb-4" : "pb-10.5"),
  );

  return (
    <li className={cn("flex", compact ? "gap-3" : "gap-4")}>
      <div className={cn("relative flex shrink-0 flex-col items-center", numbered ? "w-7" : "w-4")}>
        {/* The soft track behind the dots, drawn per row so it ends at the last dot instead of
            running on past it to the bottom of the column's text. */}
        <span
          aria-hidden
          className={cn(
            "absolute",
            numbered ? "left-2.5 w-2 bg-positive-50" : "left-0.5 w-3 bg-brand-50/50",
            isFirst ? "top-2 rounded-t-full" : "top-0",
            isLast ? "h-5.5 rounded-b-full" : "bottom-0",
          )}
        />
        {numbered ? (
          <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-positive-600 bg-card text-xs font-bold text-positive-700">
            <motion.span
              aria-hidden
              style={{ opacity: dotOpacity }}
              className="absolute -inset-0.5 rounded-full bg-positive-600"
            />
            <motion.span style={{ color: numberColour }} className="relative">
              {position + 1}
            </motion.span>
          </span>
        ) : (
          <span className="relative size-4 shrink-0 rounded-full border-2 border-brand bg-card">
            <motion.span
              aria-hidden
              style={{ opacity: dotOpacity }}
              className="absolute -inset-0.5 rounded-full bg-brand"
            />
          </span>
        )}
        {!isLast && (
          /* Lighter than the dots: the stops are the subject, the rail only joins them.
             Numbered, the rail stays dotted throughout and the dots alone carry the reveal: a bar
             sliding down a 28px-spaced column read as a segment that had failed to finish. */
          <span
            aria-hidden
            className={cn(
              "relative w-0.75 flex-1 border-l-3 border-dotted",
              numbered ? "border-positive-200" : "border-brand-100",
            )}
          >
            {numbered ? (
              /* The same dotted rail in the route's own green, grown from the top as the days are
                 reached, so the line fills in step with the dots. */
              <motion.span
                style={{ height: fillHeight }}
                className="absolute top-0 -left-0.75 w-0.75 border-l-3 border-dotted border-positive-600"
              />
            ) : (
              <motion.span
                style={{ scaleY: fillScale }}
                className="absolute inset-y-0 -left-0.75 w-0.75 origin-top bg-brand"
              />
            )}
          </span>
        )}
      </div>
      {onSelect ? (
        <div className={bodyClass}>
          <button
            type="button"
            onClick={onSelect}
            className="-mx-2 -my-1 flex flex-col gap-0.5 rounded-lg px-2 py-1 text-left outline-none transition-colors hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {body}
          </button>
        </div>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
    </li>
  );
}
