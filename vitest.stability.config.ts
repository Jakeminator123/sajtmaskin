import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { SHARED_TEST_EXCLUDE, STABILITY_TEST_GLOBS } from "./vitest.config";

/**
 * Lane-config för `npm run test:stability` (grandmaster S1, warn-only).
 *
 * Kör ENBART stabilitetsfiler (`*.stability.test.ts(x)`). Standard-configen
 * (`vitest.config.ts`) exkluderar samma glob från den blockerande `test:ci`-sviten,
 * så dessa case körs uteslutande via denna lane och kan aldrig fälla `quality`-grinden.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: STABILITY_TEST_GLOBS,
    exclude: SHARED_TEST_EXCLUDE,
  },
});
