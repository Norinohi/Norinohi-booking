"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";

import { GROUP, RISE } from "@/lib/motion";

export type TimelineStep = { key: string; title: string; description: string };

type Progress = ReturnType<typeof useTransform<number, number>>;

/*
 * A vertical list of steps whose connector fills as the reader scrolls: one scroll progress for
 * the whole list, and each segment / dot reads the slice that belongs to it. Geometry stays
 * per-row so the line always meets its dots whatever the copy's line count. The entry rise still
 * runs from the parent's `GROUP` variants — this only adds the fill on top.
 */
export default function ScrollTimeline({
  steps,
  className,
  titleClassName,
  textClassName,
  gapClassName = "pb-8 xl:pb-10.5",
  lastClassName,
}: {
  steps: readonly TimelineStep[];
  className?: string;
  /** Replace (not extend) the default heading / copy styles. */
  titleClassName?: string;
  textClassName?: string;
  /** Bottom padding of every step but the last — the connector's length. */
  gapClassName?: string;
  lastClassName?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();

  // Starts as the first dot clears the fold's lower fifth, done when the last sits at mid-screen.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.55"] });
  const smoothed = useSpring(scrollYProgress, {
    stiffness: 45,
    damping: 20,
    mass: 0.6,
    restDelta: 0.001,
  });
  const progress = useTransform(smoothed, (value) => (reduced ? 1 : value));

  return (
    <motion.ol ref={ref} variants={GROUP} className={cn("flex flex-col", className)}>
      {steps.map((step, index) => (
        <Step
          key={step.key}
          step={step}
          index={index}
          total={steps.length}
          progress={progress}
          titleClassName={titleClassName}
          textClassName={textClassName}
          gapClassName={gapClassName}
          lastClassName={lastClassName}
        />
      ))}
    </motion.ol>
  );
}

function Step({
  step,
  index,
  total,
  progress,
  titleClassName,
  textClassName,
  gapClassName,
  lastClassName,
}: {
  step: TimelineStep;
  index: number;
  total: number;
  progress: Progress;
  titleClassName?: string;
  textClassName?: string;
  gapClassName: string;
  lastClassName?: string;
}) {
  const segments = Math.max(total - 1, 1);
  const isLast = index === total - 1;
  const start = index / segments;
  const end = Math.min((index + 1) / segments, 1);

  // The dot lights up as the fill reaches it; the first one is lit from the start.
  const dotOpacity = useTransform(progress, [Math.max(start - 0.08, 0), start], [0, 1]);
  const fillScale = useTransform(progress, [start, end], [0, 1]);

  return (
    <motion.li variants={RISE} className="flex gap-4 md:gap-6">
      <div className="flex flex-col items-center self-stretch">
        <span className="relative mt-1.5 size-4 shrink-0 rounded-full bg-brand-100">
          <motion.span
            aria-hidden
            style={{ opacity: dotOpacity }}
            className="absolute inset-0 rounded-full bg-brand"
          />
        </span>
        {!isLast && (
          <span className="relative w-0.5 flex-1 overflow-hidden bg-brand-100">
            <motion.span
              aria-hidden
              style={{ scaleY: fillScale }}
              className="absolute inset-0 origin-top bg-brand"
            />
          </span>
        )}
      </div>
      <div className={cn("flex flex-col gap-1.5", isLast ? lastClassName : gapClassName)}>
        <h3
          className={cn(
            "text-xl leading-[1.1] font-semibold text-foreground md:text-2xl",
            titleClassName,
          )}
        >
          {step.title}
        </h3>
        <p className={textClassName ?? "text-base leading-[1.4] text-natural-600 md:text-xl"}>
          {step.description}
        </p>
      </div>
    </motion.li>
  );
}
