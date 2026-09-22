/**
 * The API writes a boat's measurements as "12.35 m" and "300 l", the number in its own notation
 * with an SI unit, so that no English word reaches the page. The number still has to be read in
 * the visitor's notation: a German page printed "12.35 m" where "12,35 m" was meant.
 *
 * Anything not shaped like that passes through as the API wrote it.
 */
const MEASURE = /^(\d+(?:\.\d+)?) (m|l)$/;

const UNIT = { m: "meter", l: "liter" } as const;

export type UnitFormatter = (value: number, unit: (typeof UNIT)[keyof typeof UNIT]) => string;

export function localizeMeasure(value: string, formatUnit: UnitFormatter): string {
  const match = MEASURE.exec(value.trim());
  const [, amount, symbol] = match ?? [];
  if (amount === undefined || (symbol !== "m" && symbol !== "l")) return value;
  return formatUnit(Number(amount), UNIT[symbol]);
}

/** The number of metres in a "12.35 m" the API wrote, or undefined for anything else. */
export function metresOf(value: string): number | undefined {
  const [, amount, symbol] = MEASURE.exec(value.trim()) ?? [];
  return amount !== undefined && symbol === "m" ? Number(amount) : undefined;
}
