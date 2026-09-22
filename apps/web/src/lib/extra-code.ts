/**
 * `service:1@59802921` → `service:1`: the extra a variant code belongs to. Mirrors
 * `baseExtraCode` in `@yacht-charter/providers/shared/extra-code`, which the web app does not
 * depend on.
 */
export function baseExtraCode(code: string): string {
  const at = code.indexOf("@");
  return at === -1 ? code : code.slice(0, at);
}

export function isVariantCode(code: string): boolean {
  return code.includes("@");
}

/**
 * Whether an optional extra is not already one of the quote's obligatory charges. An operator
 * can list a service both ways, and the catalogue may still hold the add-on from before a
 * resync; the offer bills the fee regardless, so offering the add-on beside it sold it twice.
 */
export function notBilledAsMandatory(
  lines: readonly { code: string; group?: string | undefined }[] | undefined,
): (item: { code: string }) => boolean {
  const mandatory = new Set(
    (lines ?? [])
      .filter((line) => line.group === "mandatory")
      .map((line) => baseExtraCode(line.code)),
  );
  return (item) => !mandatory.has(baseExtraCode(item.code));
}
