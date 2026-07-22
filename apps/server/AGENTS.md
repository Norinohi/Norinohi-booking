# AGENTS.md

These instructions apply to `apps/server` and layer on top of the repository root `AGENTS.md`.

## Scope

The Hono HTTP server (package name `server`) that hosts auth and both oRPC handlers. It is the only workspace that composes `@yacht-charter/api`, `@yacht-charter/auth`, and `@yacht-charter/db` together.

## Commands

```bash
pnpm dev:server                   # from repo root — tsx watch src/index.ts
pnpm --filter server build        # tsdown → dist/index.mjs
pnpm --filter server check-types  # tsc -b  (composite project)
pnpm --filter server start        # node dist/index.mjs
```

## Conventions

- `src/index.ts` is the single entry point and its middleware order is load-bearing: `evlog()` → the `identifyUser` auth-logging middleware → `cors` → `/api/auth/*` → the oRPC dispatch middleware → the `/` health route. Insert new middleware deliberately, not at the top.
- The oRPC middleware tries `rpcHandler` (prefix `/rpc`) first, then `apiHandler` (prefix `/api-reference`), calling `next()` only when neither matched. Preserve that fall-through.
- The port is hardcoded as `3000` in the `serve()` call — it is not read from env. Changing it also means changing `CORS_ORIGIN`/`NEXT_PUBLIC_SERVER_URL` in the `.env` files.
- Business logic belongs in `packages/api` as procedures on `appRouter`, not in this app. This app only wires transport.
- `tsdown.config.ts` sets `noExternal: [/@yacht-charter\/.*/]`, so workspace packages are bundled into `dist/`. New internal packages are covered by that pattern automatically; new external deps are not bundled and must be installed at runtime.
- `tsconfig.json` sets `composite: true` and `jsxImportSource: "hono/jsx"` — this app type-checks with `tsc -b`, not `--noEmit`.
