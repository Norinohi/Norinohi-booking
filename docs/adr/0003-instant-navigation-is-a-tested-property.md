---
status: accepted
---

# Instant navigation is a tested property, not a one-off optimisation

Shell optimisations decay silently: any future top-level `await` above a boundary un-instants a
route and nothing fails. So each optimised route ships with a `@next/playwright` `instant()` test
that asserts the static shell commits while dynamic data is gated, run against a production build
(`next build && next start`) — never `next dev`, which does not prefetch and gives invalid verdicts.
Because this repo has no CI at all today, a GitHub Actions workflow is introduced alongside it to
run `check-types`, `check`, `test` and the `instant()` suite on pull requests.

## Considered options

- **Local-only rig, run by hand.** Rejected: it is the status quo for every other check in this
  repo, and this repo already ships type errors to production because nothing enforces them.
- **Pre-push git hook.** Rejected as the primary gate: `--no-verify` skips it and a production build
  plus e2e run is too slow to sit in front of every push.
- **Railway preview environment as the rig.** Rejected as the default: it measures real network
  conditions, but every RED/GREEN cycle costs a deploy and a stale deploy silently produces a false
  verdict. Remains available for spot-checking.

## Consequences

- `next.config.ts` gains `experimental.exposeTestingApiInProductionBuild`, gated on an explicit
  env opt-in (`EXPOSE_TESTING_API === '1'`). **This must never be true in a production deploy.**
  Without it `instant()` silently no-ops and the test passes vacuously — a green suite that proves
  nothing, which is worse than no suite.
- A verdict requires the full stack: Postgres up, the Hono server on :3000, and a production web
  build. The rig is documented in `instant-nav.rig.md` so it is reproducible rather than folklore.
- Adding CI to a repo that has never had it will surface pre-existing failures. Those are findings,
  not regressions from this work.
