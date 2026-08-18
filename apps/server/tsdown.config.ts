import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/migrate.ts",
    "./src/sync-catalogue.ts",
    "./src/sync-availability.ts",
    "./src/sweep-expiries.ts",
    "./src/payment-reminders.ts",
    "./src/seed-facets.ts",
    "./src/publish-listings.ts",
  ],
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@yacht-charter\/.*/],
});
