import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/migrate.ts",
    "./src/sync-catalogue.ts",
    "./src/sync-availability.ts",
    "./src/seed-facets.ts",
  ],
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@yacht-charter\/.*/],
});
