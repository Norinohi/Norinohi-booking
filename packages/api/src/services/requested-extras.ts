/**
 * The wording that carries an unsellable extra to the base.
 *
 * Its own module, and free of the database, because the special-requests field is the single
 * place a human at the base reads: what it says is worth reading and testing on its own, and
 * `booking.ts` cannot be imported without an environment.
 */
export function appendRequestedExtras(
  note: string | undefined,
  names: readonly string[],
): string | null {
  const trimmed = note?.trim() || null;
  if (names.length === 0) return trimmed;

  const asked = `Requested from the base: ${names.join(", ")}`;
  return trimmed ? `${trimmed}\n\n${asked}` : asked;
}
