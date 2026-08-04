# Yacht Charter

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Node.js** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Copy `apps/server/.env.example` to `apps/server/.env`.
2. Start the local PostgreSQL container.
3. Apply committed migrations.
4. Seed the database with rich mock catalogue data.

```bash
pnpm db:start
pnpm db:migrate
pnpm db:seed
```

`pnpm db:seed` rebuilds the `listing_search_doc` read model after inserting catalogue, location, media, amenity, availability, review, and provider provenance data.

For local-only schema experiments, you can push the current Drizzle schema directly:

```bash
pnpm db:push
```

Committed schema changes should use migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

## Running Locally

Run both apps:

```bash
pnpm dev
```

Run backend only:

```bash
pnpm dev:server
```

Open [http://localhost:3001](http://localhost:3001) for the web application.
The API runs at [http://localhost:3000](http://localhost:3000).

## API References

With `pnpm dev:server` running, test the backend from the Scalar docs:

- oRPC / marketplace API: [http://localhost:3000/api-reference](http://localhost:3000/api-reference)
- Better Auth API: [http://localhost:3000/api/auth/reference](http://localhost:3000/api/auth/reference)
- Raw marketplace OpenAPI JSON: [http://localhost:3000/api-reference/openapi.json](http://localhost:3000/api-reference/openapi.json)
- Raw Better Auth OpenAPI JSON: [http://localhost:3000/api/auth/open-api/generate-schema](http://localhost:3000/api/auth/open-api/generate-schema)

Useful backend-only M3 smoke routes:

- `GET /charter-search/results?destination=Croatia&currency=EUR&page=1&pageSize=10`
- `GET /charter-search/results?currency=EUR&page=32&pageSize=10`
- `GET /charter-search/facets?currency=EUR`
- `GET /charter-search/map-markers?currency=EUR&limit=50`
- `GET /charter-search/suggestions?query=Split`
- `GET /listings/{listingId}`
- `GET /listings/{listingId}/reviews`
- `GET /listings/{listingId}/similar`
- `GET /listings/{listingId}/availability-calendar?from=2026-07-01&to=2026-09-30&currency=EUR`

You do not need to build or run `apps/web` to test these backend endpoints.

`/charter-search/results` supports direct page clicks for the results pagination UI. Use `page` + `pageSize` and read `pagination.startItem`, `pagination.endItem`, and `pagination.totalItems` for labels such as `Showing 311-320 of 320`. Cursor pagination is still supported through `cursor` + `limit`, but do not send `cursor` and `page` together.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@yacht-charter/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Project Structure

```
yacht-charter/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Hono, ORPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm dev`: Start all applications in development mode.
- `pnpm dev:web`: Start only the web application.
- `pnpm dev:server`: Start only the server.
- `pnpm build`: Build all applications. For backend-only changes, prefer `pnpm --filter server build`.
- `pnpm check-types`: Check TypeScript types across all workspaces.
- `pnpm check`: Run Oxlint and Oxfmt. This can rewrite files.
- `pnpm db:start`: Start the local PostgreSQL container.
- `pnpm db:stop`: Stop the local PostgreSQL container.
- `pnpm db:down`: Remove the local PostgreSQL container.
- `pnpm db:push`: Push the current schema directly to the local database.
- `pnpm db:generate`: Generate committed Drizzle migration files.
- `pnpm db:migrate`: Run committed database migrations.
- `pnpm db:seed`: Seed local mock backend catalogue data and rebuild search docs.
- `pnpm db:studio`: Open Drizzle Studio.
