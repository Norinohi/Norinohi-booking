# syntax=docker/dockerfile:1

# Build for apps/web, replacing railpack.
#
# Railpack's final image is the whole build context: it copies `/app/node_modules` and `/app` as
# two layers, so the deployed image carried the entire pnpm workspace — every devDependency, both
# other apps, the full `.next` including the prerender cache. 3.1 GB, of which the running server
# reads a few hundred megabytes. Export and push cost more wall-clock than the prerender did.
#
# The runner stage below copies only `.next/standalone` (the traced subset Next computed), the
# client assets, and `public/`. Nothing else follows it into the image.

ARG NODE_VERSION=22.19.0

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
# Turbopack (which `next build` uses) is a Rust binary dynamically linked against libatomic,
# which Debian's slim image does not ship. Railpack installs the same package for this project
# (its build log shows "install apt packages: libatomic1") — without it `next build` fails to
# even start.
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests only, so a source-only change reuses the install layer. `--filter=web...` still needs
# every workspace's manifest present: pnpm resolves the whole graph before it prunes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/observability/package.json packages/observability/
COPY packages/providers/package.json packages/providers/
COPY packages/transactional/package.json packages/transactional/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app ./
COPY . .

# `NEXT_PUBLIC_*` are inlined into the client bundle at build time, so they are build args rather
# than runtime env. NEXT_PUBLIC_SERVER_URL is doing double duty: the prerender of ~3,900 catalog
# pages calls that API, so it must point at a server that is already up and serving the current
# packages/api (scripts/check-api.mjs fails the build early when it is not).
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_CALENDLY_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME \
    NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_CALENDLY_URL=$NEXT_PUBLIC_CALENDLY_URL
RUN pnpm turbo run build --filter=web...

FROM base AS runner
ENV NODE_ENV=production
RUN useradd --system --uid 1001 nextjs

# `standalone` is laid out from `outputFileTracingRoot`, so the server lands at apps/web/server.js
# and its pruned node_modules at the root. Static assets and public/ are deliberately outside the
# trace and have to be copied separately — Next does not do it, and their absence shows up only at
# runtime as a page that renders unstyled.
COPY --from=builder --chown=nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs /app/apps/web/public ./apps/web/public

USER nextjs
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
