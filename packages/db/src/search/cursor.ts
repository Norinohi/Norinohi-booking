import { z } from "zod";

export type SearchCursor = {
  value: string | number;
  listingId: string;
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
