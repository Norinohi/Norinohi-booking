/**
 * A remote image URL in the form a `srcset` candidate can carry.
 *
 * `srcset` separates a candidate's URL from its width descriptor by whitespace, so a vendor file
 * name with a space in it ("w (5).jpg", which NauSYS publishes) splits into a URL that ends at
 * "w" and an unknown descriptor, and the browser drops the candidate. The WHATWG serializer
 * percent-encodes the space and leaves an existing escape like `%20` alone, so an already
 * encoded URL passes through unchanged rather than becoming `%2520`.
 *
 * Commas are left alone. They also end a candidate, but every URL that reaches here is rendered
 * `unoptimized`, and Next emits no `srcset` at all in that mode — while Mapbox's Static Images API
 * reads `lng,lat,zoom` out of the path and 404s on `%2C`.
 */
export function srcsetSafeUrl(src: string): string {
  if (!URL.canParse(src)) return src;
  return new URL(src).toString();
}
