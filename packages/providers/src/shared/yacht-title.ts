/**
 * How a listing's display title is built from the two things a vendor gives us: the boat's own
 * name and its model.
 *
 * One implementation for every adapter, because the two had drifted. Booking Manager guarded
 * against the model appearing twice and NauSYS concatenated blindly, which is how 142 listings
 * in one production catalogue came to be called "Sole Sole" and "Moja Maja Moja Maja" - both
 * cases where the vendor records the model AS the boat's name, common for one-off crewed and
 * motor yachts. The slug is derived from this string, so a duplicate leaks into the URL too.
 */
export function mergeYachtTitle(
  name: string | undefined,
  modelName: string | undefined,
): string | undefined {
  const boat = name?.trim() || undefined;
  const model = modelName?.trim() || undefined;

  if (boat === undefined) return model;
  if (model === undefined) return boat;
  /*
   * `includes` rather than equality: "Salona 45 Performance" carries "Salona 45" without being
   * it, and appending the model there reads as a different, longer boat.
   */
  return boat.toLowerCase().includes(model.toLowerCase()) ? boat : `${boat} ${model}`;
}

/**
 * The model as a display half, or nothing when it would only repeat the name.
 *
 * The pair `(name, modelSubtitle)` is what a screen composes; `mergeYachtTitle` is the same
 * decision flattened into one string for slugs, `<title>` and structured data. Kept together so
 * the two can never disagree about whether the model is worth showing.
 */
export function yachtModelSubtitle(
  name: string | undefined,
  modelName: string | undefined,
): string | undefined {
  const boat = name?.trim() || undefined;
  const model = modelName?.trim() || undefined;

  if (model === undefined) return undefined;
  if (boat === undefined) return model;
  return boat.toLowerCase().includes(model.toLowerCase()) ? undefined : model;
}
