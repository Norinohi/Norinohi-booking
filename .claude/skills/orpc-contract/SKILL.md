---
name: orpc-contract
description: Repo conventions for authoring oRPC procedures/contracts in packages/api for the yacht-charter marketplace. Use when adding or editing procedures, routers, input/output validation, or auth middleware, or when a web screen needs a new endpoint. TRIGGER when editing packages/api/src (routers, index, context) or the task mentions oRPC, appRouter, procedures, or the API contract.
---

# oRPC contract conventions (yacht-charter)

Authoritative model: `docs/backend-architecture.md` §5 (contract groups) + Appendix A. The seam rule: **the web app only ever sees canonical DTOs — provider payload shapes never leak into a procedure's output.**

## Non-negotiable rules
1. **Validation is Zod v4** (`zod` catalog `^4`), converted via `@orpc/zod/zod4`. Use top-level formats (`z.url()`, `z.iso.date()`), not `z.string().url()`.
2. **`appRouter` is a plain object literal**, keyed by name. Sub-routers are nested plain objects. Do NOT call `os.router(...)` or re-create the builder — import `publicProcedure`/`protectedProcedure` from `packages/api/src/index.ts`.
3. **Every procedure has `.input()` and `.output()`** Zod schemas. Infer client types from `AppRouterClient` — never hand-write request/response types on the web side.
4. **Errors via `new ORPCError("CODE")`** (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, plus custom like `PRICE_CHANGED`).
5. **Request-scoped values go in `context.ts`**, not threaded through args.
6. **No provider shapes.** Handlers call domain services (`packages/api/src/services/*`) that return canonical DTOs; procedures re-validate with `.output()`.

## The three procedure levels
```ts
// packages/api/src/index.ts already exports publicProcedure & protectedProcedure.
// Add adminProcedure:
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "./index";

const requireAdmin = protectedProcedure.middleware(async ({ context, next }) => {
  if (context.session?.user?.role !== "admin" && context.session?.user?.role !== "staff") {
    throw new ORPCError("FORBIDDEN");
  }
  return next({ context });
});
export const adminProcedure = protectedProcedure.use(requireAdmin);
```
- `publicProcedure` — search, listing, availability calendar, quote (anonymous quoting allowed).
- `protectedProcedure` — wishlist, profile, referral, checkout, booking (scope to `context.session.user.id`).
- `adminProcedure` — `admin.*`; every mutation writes `audit_log`. Never expose agency price/commission outside admin.

## Procedure shape
```ts
import { z } from "zod";
import { publicProcedure } from "../index";
import { searchListings } from "../services/search";

const ListingCard = z.object({
  id: z.string(), slug: z.string(), title: z.string(),
  priceHintMinor: z.number().int().nullable(), currency: z.string(),
  base: z.object({ name: z.string(), lat: z.number(), lng: z.number() }),
});

export const search = {
  query: publicProcedure
    .input(z.object({ filters: z.object({}).passthrough(), page: z.number().int().default(1) }))
    .output(z.object({ items: z.array(ListingCard), total: z.number(), nextCursor: z.string().nullable() }))
    .handler(({ input }) => searchListings(input)), // service returns canonical DTOs
};
```
Register on `appRouter` in `packages/api/src/routers/index.ts`:
```ts
export const appRouter = { healthCheck, privateData, search, listing, availability, wishlist, profile };
```

## Workflow & gates
- After adding a procedure: `pnpm check-types` (the whole point — client types flow from inference) + `pnpm build`.
- Verify the OpenAPI docs render at `/api-reference` and RPC at `/rpc` (server on :3000).
- Don't run `pnpm check` unless you want the formatter to rewrite files.

## Checklist
- [ ] Zod v4 `.input()`/`.output()` · [ ] plain-object router, registered on `appRouter`
- [ ] correct procedure level (public/protected/admin) · [ ] output is a canonical DTO, no provider fields
- [ ] admin mutations write `audit_log` · [ ] `check-types` green
