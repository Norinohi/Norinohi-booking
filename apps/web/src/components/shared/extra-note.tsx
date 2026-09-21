/*
 * The operator's own terms for an extra, as the offer states them: "Applies only when skipper
 * is chosen", "only if cook is booked", "includes final cleaning, gas, bed linen". Operator copy,
 * so it reads in the operator's language. Clamped, because some write a paragraph; the whole of
 * it stays on hover.
 */
export function ExtraNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  return (
    <span title={note} className="line-clamp-2 text-xs leading-[1.3] text-natural-500">
      {note}
    </span>
  );
}
