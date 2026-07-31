import { stagger } from "motion/react";

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATION = 0.6;
export const COUNT_DURATION = 1.4;
export const STAGGER = 0.1;

export const VIEWPORT = { once: true, amount: 0.3 };

export const GROUP = {
  hidden: {},
  show: { transition: { delayChildren: stagger(STAGGER) } },
};

export const RISE = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION, ease: EASE } },
};
