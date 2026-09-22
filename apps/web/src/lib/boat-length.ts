import type { useFormatter } from "next-intl";

/**
 * A boat's length reads in feet first and metres second ("38 ft / 11.6 m"), because feet is how
 * charter customers size a yacht. Only length: beam, draught and tanks stay metric.
 *
 * Whole feet, one decimal of a metre: the catalogue stores centimetres, and a figure finer than
 * that on either side is noise nobody sizes a boat by.
 */
export const FEET_PER_METRE = 1 / 0.3048;

export const metresToFeet = (metres: number) => Math.round(metres * FEET_PER_METRE);
export const feetToMetres = (feet: number) => feet / FEET_PER_METRE;
export const roundMetres = (metres: number) => Math.round(metres * 10) / 10;

type NumberFormatter = Pick<ReturnType<typeof useFormatter>, "number">;

const feetText = (format: NumberFormatter, feet: number) =>
  format.number(feet, { style: "unit", unit: "foot", unitDisplay: "short" });

const metresText = (format: NumberFormatter, metres: number) =>
  format.number(roundMetres(metres), { style: "unit", unit: "meter", unitDisplay: "short" });

export function formatBoatLength(format: NumberFormatter, metres: number): string {
  return `${feetText(format, metresToFeet(metres))} / ${metresText(format, metres)}`;
}

/** A range the filters hold in feet, as "38-61 ft / 11.6-18.6 m". */
export function formatBoatLengthRange(
  format: NumberFormatter,
  [fromFeet, toFeet]: readonly [number, number],
): string {
  const fromMetres = format.number(roundMetres(feetToMetres(fromFeet)));
  return `${format.number(fromFeet)}-${feetText(format, toFeet)} / ${fromMetres}-${metresText(
    format,
    feetToMetres(toFeet),
  )}`;
}
