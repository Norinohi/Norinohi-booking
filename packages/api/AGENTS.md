# AGENTS.md

These instructions apply to `packages/api` and layer on top of the repository root `AGENTS.md`.

## Scope

The oRPC contract shared by the server and the web app — procedures, the router, and the request context. This is the seam: a change here propagates types to `apps/web` with no codegen step.

## Commands

This package has no scripts of its own (`"scripts": {}`). It is type-checked transitively by its consumers via `pnpm check-types`.

## Conventions

- Build every procedure on `publicProcedure` or `protectedProcedure` from `src/index.ts`. Do not call `os.$context<Context>()` again — `o` is already that builder, and a second one bypasses the `requireAuth` middleware.
- `protectedProcedure` guarantees a session: it throws `ORPCError("UNAUTHORIZED")` when `context.session?.user` is absent, then re-injects `session` into context. Inside a protected handler, treat `context.session` as present rather than re-checking.
- Register new procedures on the `appRouter` object in `src/routers/index.ts`. Anything not on `appRouter` is unreachable from the client, and the exported `AppRouter` / `AppRouterClient` types are what `apps/web` consumes.
- Exports are subpath-based (`"./*": "./src/*.ts"`), so consumers import `@yacht-charter/api/routers/index` and `@yacht-charter/api/context` directly. There is no barrel — adding a file makes it importable with no manifest change.
- `src/context.ts` is where request-scoped values belong. It currently returns `{ auth: null, session }`; extend the return type there rather than threading extra arguments through handlers.
- `hono` is a **devDependency** here — the `Context` type is imported as `import type`. Keep it type-only; a runtime import from Hono would make this package depend on the server framework.
