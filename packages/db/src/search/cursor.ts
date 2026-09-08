import { z } from "zod";

export type SearchCursor = {
  value: string | number;
  listingId: string;
  /**
   * Which price the sort value was computed from, on a price cursor.
   *
   * Absent on every other sort, and on cursors minted before the catalogue could show either
   * figure: the reader treats a missing basis as the all-in one, which is what those were.
   */
  basis?: "all_in" | "base";
};

/*
 * What a cursor carries once decoded. It arrives as an attacker-supplied query
 * parameter, so `value` is whatever JSON was in it: repository.ts runs it through
 * Number(), where a non-scalar degrades to NaN and the page comes back unfiltered.
 * Requiring a scalar here would reject those cursors instead, which is a behaviour
 * change the tests in cursor.test.ts pin down deliberately.
 */
const decodedCursorSchema = z.object({
  listingId: z.string().min(1),
  value: z.json(),
  /* Validated, unlike `value`: an unrecognised basis must not be read as a matching one, and
     dropping the cursor is the safe answer either way. */
  basis: z.enum(["all_in", "base"]).optional(),
});

export type DecodedSearchCursor = z.infer<typeof decodedCursorSchema>;

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSearchCursor(value: string | undefined): DecodedSearchCursor | undefined {
  if (!value) return undefined;

  try {
    const decoded = decodedCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return decoded.success ? decoded.data : undefined;
  } catch {
    return undefined;
  }
}
