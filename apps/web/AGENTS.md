# AGENTS.md

These instructions apply to `apps/web` and layer on top of the repository root `AGENTS.md`.

## Scope

The Next.js 16 App Router frontend (package name `web`), served on port 3001 with Turbopack. It renders UI, calls the server over oRPC, and owns no data access of its own.

## Commands

```bash
pnpm dev:web                 # from repo root
pnpm --filter web build      # next build
pnpm --filter web check-types  # tsc --noEmit
```

## Conventions

- `tsconfig.json` here does **not** extend `@yacht-charter/config/tsconfig.base.json` — it is Next's own config with the `next` plugin and `paths` for `@/*` and `@yacht-charter/ui/*`. Do not "fix" it to extend the base; the two disagree on `target`, `lib`, and `types` on purpose.
- Shared, reusable primitives belong in `packages/ui`. Only app-specific components go in `src/components/`. When in doubt, put it in `packages/ui`.
- Never edit `next-env.d.ts` — Next regenerates it and the file says so.
- Server data goes through `src/utils/orpc.ts` (`client`, `orpc`, `queryClient`). Do not construct an `RPCLink` or a second `QueryClient` elsewhere; `providers.tsx` already mounts the singleton.
- Auth goes through `src/lib/auth-client.ts` (`authClient`). Preserve the `baseURL` comment there — the `/api/auth` path must match the server mount.
- `reactCompiler: true` and `typedRoutes: true` are enabled in `next.config.ts`. Route types are generated into `.next/`; standalone `tsc --noEmit` still passes without a build.
- `next.config.ts` imports `@yacht-charter/env/web` purely for its validation side effect — keep that import first.
- Logging is split across `src/lib/evlog.ts`, `instrumentation.ts`, and `src/proxy.ts`. Edit `src/lib/evlog.ts`; the other two delegate to it.
