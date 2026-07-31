export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATION = 0.6;
export const COUNT_DURATION = 1.4;
export const STAGGER = 0.1;

export const VIEWPORT = { once: true, amount: 0.3 };

/** Plain numbers only — these cross the server/client boundary as props. */
export const GROUP = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};

export const RISE = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION, ease: EASE } },
};

export const DRAW = {
  hidden: { pathLength: 0, opacity: 0 },
  show: { pathLength: 1, opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

/** Fires as the tick lands. Fixed offsets — random values would break hydration. */
export const SPARK_START = 0.42;

export const SPARKS = [
  { x: 24, y: -20, size: 7, delay: 0 },
  { x: -25, y: -14, size: 5, delay: 0.05 },
  { x: 30, y: 4, size: 4, delay: 0.02 },
  { x: -29, y: 7, size: 6, delay: 0.07 },
  { x: 17, y: 22, size: 5, delay: 0.04 },
  { x: -18, y: 19, size: 4, delay: 0.09 },
  { x: 4, y: -28, size: 6, delay: 0.06 },
  { x: -6, y: 26, size: 4, delay: 0.03 },
];

export const SLIDE_DURATION = 0.25;

/** `custom` carries the direction: 1 moves forward, -1 back. Client-only — these are functions. */
export const SLIDE = {
  enter: (direction: number) => ({ x: direction * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -40, opacity: 0 }),
};
