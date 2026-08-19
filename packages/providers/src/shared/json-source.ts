/*
 * V8 ships both halves of the json-parse-with-source proposal (Node 22+), but the
 * TypeScript lib does not declare them yet. Declared by interface merging rather than
 * reached through a cast: the shapes below are the actual contract, and a cast would
 * just hide the fact that we are relying on something the lib has not caught up with.
 *
 * A module rather than a `.d.ts` so the declarations travel with the import graph.
 * `apps/server` compiles these sources directly and its `include` does not reach a
 * stray `.d.ts` here, so an ambient file type-checked in this package and failed in
 * the app - which is the sort of split that only shows up at deploy time.
 *
 * Declarations only, deliberately. The `unknown` in these signatures is the JSON API's
 * own contract - there is no boundary here to parse at - and keeping them apart means
 * the rule exemption they need does not cover a line of real logic.
 */

declare global {
  /** Opaque marker `JSON.stringify` emits verbatim, without quotes. */
  interface RawJSON {
    readonly rawJSON: string;
  }

  interface JSON {
    rawJSON(text: string): RawJSON;
    parse(
      text: string,
      reviver: (
        this: unknown,
        key: string,
        value: unknown,
        context?: { readonly source?: string },
      ) => unknown,
    ): unknown;
  }
}

export {};
