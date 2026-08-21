"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { GROUP, RISE } from "@/lib/motion";

const STEPS = ["destination", "yacht", "book"] as const;
const SEGMENTS = STEPS.length - 1;

/*
 * The connector fills as the reader scrolls: one scroll progress for the whole list, and each
 * segment / dot reads the slice that belongs to it. Geometry stays per-row so the line always
 * meets its dots whatever the copy's line count. The entry rise still runs from the parent.
 */
export default function Timeline() {
  const t = useTranslations("Home.HowItWorks.steps");
  const ref = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();

  // Starts as the first dot clears the fold's lower quarter, done when the last sits at mid-screen.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.55"] });
  const smoothed = useSpring(scrollYProgress, {
    stiffness: 45,
    damping: 20,
    mass: 0.6,
    restDelta: 0.001,
  });
  const progress = useTransform(smoothed, (value) => (reduced ? 1 : value));

  return (
    <motion.ol ref={ref} variants={GROUP} className="flex flex-col md:w-142">
      {STEPS.map((step, index) => (
        <Step key={step} step={step} index={index} progress={progress} t={t} />
      ))}
    </motion.ol>
  );
}

function Step({
  step,
  index,
  progress,
  t,
}: {
  step: (typeof STEPS)[number];
  index: number;
  progress: ReturnType<typeof useTransform<number, number>>;
  t: ReturnType<typeof useTranslations<"Home.HowItWorks.steps">>;
}) {
  const isLast = index === SEGMENTS;
  const start = index / SEGMENTS;
  const end = (index + 1) / SEGMENTS;

  // The dot lights up just as the fill reaches it; the first one is lit from the start.
  const dotOpacity = useTransform(progress, [Math.max(start - 0.08, 0), start], [0, 1]);
  const fillScale = useTransform(progress, [start, end], [0, 1]);

  return (
    <motion.li variants={RISE} className="flex gap-4 md:gap-6">
      <div className="flex flex-col items-center">
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
      <div className={isLast ? "" : "pb-8 xl:pb-10.5"}>
        <h3 className="text-xl leading-[1.1] font-semibold text-foreground md:text-2xl">
          {t(`${step}.title`)}
        </h3>
        <p className="mt-1.5 text-base leading-[1.4] text-natural-600 md:text-xl">
          {t(`${step}.description`)}
        </p>
      </div>
    </motion.li>
  );
}
