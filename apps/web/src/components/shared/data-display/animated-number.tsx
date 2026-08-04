"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useFormatter } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";

import { COUNT_DURATION, EASE, VIEWPORT } from "@/lib/motion";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type AnimatedNumberProps = {
  value: number;
  /** Fixed decimal places. Grouping separators follow the active locale on their own. */
  decimals?: number;
  suffix?: string;
  duration?: number;
  delay?: number;
  className?: string;
};

export default function AnimatedNumber({
  value,
  decimals = 0,
  suffix,
  duration = COUNT_DURATION,
  delay = 0,
  className,
}: AnimatedNumberProps) {
  const format = useFormatter();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const count = useMotionValue(value);

  const text = useTransform(count, (latest) =>
    format.number(latest, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  );

  useIsomorphicLayoutEffect(() => {
    if (reduced || !inView) return;

    count.set(0);
    const controls = animate(count, value, { duration, delay, ease: EASE });
    return () => controls.stop();
  }, [count, delay, duration, inView, reduced, value]);

  return (
    <span ref={ref} className={className}>
      <motion.span>{text}</motion.span>
      {suffix}
    </span>
  );
}
