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
- **Components are grouped by purpose** under `src/components/<category>/`: `actions/` (button, icon-button), `form/` (input, textarea, checkbox, label, input-group), `overlay/` (dialog, dropdown-menu, tooltip), `feedback/` (notification, notification-toast, sonner, skeleton, empty), `data-display/` (card, chip, marker), `navigation/` (breadcrumb). Import paths carry the category, e.g. `@yacht-charter/ui/components/actions/button`. The `exports` wildcard `./components/*` matches nested paths, so a new file under any category is importable immediately — no manifest edit, no barrel file. Leftover Better-T-Stack chat scaffold (`attachment`, `bubble`, `message`, `message-scroller`) stays flat in `src/components/` and is unused — don't build on it.
- **shadcn CLI writes flat.** `npx shadcn add <name> -c packages/ui` drops the file in `src/components/` root; after adding, move it into the right category folder and fix its import path. Hooks live in `src/hooks/`, helpers in `src/lib/`.
- Inside this package, import siblings through the package alias (`@yacht-charter/ui/lib/utils`, `@yacht-charter/ui/components/actions/button`), not relative paths. `tsconfig.json` maps `@yacht-charter/ui/*` to `./src/*` to make that resolve.
- `src/styles/globals.css` is the only stylesheet; `apps/web/src/index.css` is a single `@import` of it. Add design tokens and Tailwind layers here, never in the app.
- `tsconfig.json` sets `"types": []` deliberately — this package must not pick up Node types. Keep components DOM-only and free of Node built-ins.
