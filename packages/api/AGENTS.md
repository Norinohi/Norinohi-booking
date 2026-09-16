# AGENTS.md

These instructions apply to `packages/api` and layer on top of the repository root `AGENTS.md`.

## Scope

The oRPC contract shared by the server and the web app — procedures, the router, and the request context. This is the seam: a change here propagates types to `apps/web` with no codegen step.

## Commands

```bash
pnpm --filter @yacht-charter/api check-types   # tsc -b
pnpm --filter @yacht-charter/api test          # vitest run
```

Tests are co-located as `src/**/*.test.ts`. There is no `vitest.config.ts` anywhere in the repo — the defaults already pick these up, so do not add one. Keep them to pure functions: there is no database harness, and mocking Drizzle's builder chain only tests the mock.

## Conventions

- Build every procedure on `publicProcedure` or `protectedProcedure` from `src/index.ts`. Do not call `os.$context<Context>()` again — `o` is already that builder, and a second one bypasses the `requireAuth` middleware.
- `protectedProcedure` guarantees a session: it throws `ORPCError("UNAUTHORIZED")` when `context.session?.user` is absent, then re-injects `session` into context. Inside a protected handler, treat `context.session` as present rather than re-checking.
- Register new procedures on the `appRouter` object in `src/routers/index.ts`. Anything not on `appRouter` is unreachable from the client, and the exported `AppRouter` / `AppRouterClient` types are what `apps/web` consumes.
- Exports are subpath-based (`"./*": "./src/*.ts"`), so consumers import `@yacht-charter/api/routers/index` and `@yacht-charter/api/context` directly. There is no barrel — adding a file makes it importable with no manifest change.
- `src/context.ts` is where request-scoped values belong. It currently returns `{ auth: null, session }`; extend the return type there rather than threading extra arguments through handlers.
- `hono` is a **devDependency** here — the `Context` type is imported as `import type`. Keep it type-only; a runtime import from Hono would make this package depend on the server framework.

## Tools layer

`src/services/tools/` is the transport-free surface for callers that are not HTTP clients: a
future AI assistant, jobs, scripts. One file per tool plus `index.ts`, which exports the `tools`
registry, `invokeTool` and `toolManifest` (name, description and input JSON Schema per tool, in
the form model tool-calling APIs take).

- A tool is `defineTool({ name, description, input, output, run(ctx, input) })`. `ctx` is
  `ToolContext` (`{ db }`) and nothing else: no session, no request, no oRPC types.
- Call tools through `invokeTool(tool, ctx, input)`. It parses the input (a failure is a
  `BadRequestError` with `data.code = "TOOL_INPUT_INVALID"`), runs, and parses the output (a
  mismatch is an `InternalError`). `run` itself trusts its input.
- Reuse contract schemas (`contracts/*`) for input and output where one exists, and wrap a
  service rather than restating it. Services under a tool throw domain errors, like any other.
- Tools are read-only. `quotePreview` exists because the live quote path (`createQuote`) calls
  every vendor and writes quote, attempt, refusal and learned-extra rows; the preview reads the
  synced calendar and rate list and applies only the internal price rules, and says so with
  `binding: false`.
- Current tools: `searchYachts` (the catalogue results service, `services/charter-search.ts`,
  also behind `charterSearch.results`), `yachtAvailability`, `quotePreview`, `suggestRoutes`
  (popular routes by country or region, plus the itinerary for a base) and `nearestMarinas`.
- A new tool gets a line in `index.ts` and validation cases in `tools.test.ts`. That test
  imports the registry after setting `SKIP_ENV_VALIDATION`, because the catalogue contract
  reaches the provider registry, which validates the server env on load.
