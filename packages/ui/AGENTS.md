# AGENTS.md

These instructions apply to `packages/ui` and layer on top of the repository root `AGENTS.md`.

## Scope

The shared shadcn/ui component library and the single Tailwind v4 stylesheet. `apps/web` re-exports nothing of its own — it imports from here.

## Commands

```bash
npx shadcn@latest add <name> -c packages/ui   # run from the REPO ROOT, note -c
pnpm --filter @yacht-charter/ui check-types   # tsc --noEmit
```

## Conventions

- Add primitives with the `-c packages/ui` flag from the repo root. Running the shadcn CLI without it writes into `apps/web` instead, which is reserved for app-specific blocks.
- `components.json` here sets `style: "base-lyra"`, `baseColor: "neutral"`, and `iconLibrary: "lucide"`. `apps/web/components.json` mirrors these and points `css` at this package's `src/styles/globals.css`. Keep the two files in agreement.
- Components live in `src/components/*.tsx`, hooks in `src/hooks/`, helpers in `src/lib/`. The `exports` map is wildcard-based, so a new file is importable immediately — no manifest edit needed, and no barrel file exists.
- Inside this package, import siblings through the package alias (`@yacht-charter/ui/lib/utils`, `@yacht-charter/ui/components/button`), not relative paths. `tsconfig.json` maps `@yacht-charter/ui/*` to `./src/*` to make that resolve.
- `src/styles/globals.css` is the only stylesheet; `apps/web/src/index.css` is a single `@import` of it. Add design tokens and Tailwind layers here, never in the app.
- `tsconfig.json` sets `"types": []` deliberately — this package must not pick up Node types. Keep components DOM-only and free of Node built-ins.
