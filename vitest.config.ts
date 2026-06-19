import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Stabilitets-lane-filer (grandmaster S1): `*.stability.test.ts(x)` körs ENBART av
 * `npm run test:stability` (egen config: `vitest.stability.config.ts`). De exkluderas
 * från standard-sviten här så att ett flaky/failande stability-case INTE kan fälla den
 * BLOCKERANDE `test:ci`/`quality`-grinden — annars vore warn-only-syftet undergrävt.
 */
export const STABILITY_TEST_GLOBS = ["**/*.stability.test.{ts,tsx}"];

/** Delade exclude-globs (vendor-/build-träd) som båda lane-configarna använder. */
export const SHARED_TEST_EXCLUDE = [
  "node_modules/**",
  ".next/**",
  "old/**",
  "e2e/**",
  "vercel_templates_levels/**",
  "research/**",
  "_template_refs/**",
  "data/**",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@viewser": path.resolve(__dirname, "src/viewser"),
      "@preview-runtime": path.resolve(
        __dirname,
        "src/viewser/lib/preview-runtime/index.ts",
      ),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Only this repo's suites — never vendor trees under data/ (repo-cache tests).
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "_isolated_tests/**/*.{test,spec}.ts",
    ],
    exclude: [...SHARED_TEST_EXCLUDE, ...STABILITY_TEST_GLOBS],
  },
});
