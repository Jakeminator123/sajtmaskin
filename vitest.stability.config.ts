import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { SHARED_TEST_EXCLUDE, STABILITY_TEST_GLOBS } from "./vitest.config";

/**
 * Lane-config för `npm run test:stability` (grandmaster S1, warn-only).
 *
 * Kör ENBART stabilitetsfiler (`*.stability.test.ts(x)`). Standard-configen
 * (`vitest.config.ts`) exkluderar samma glob från `test:ci`. Den deterministiska
 * mängden körs separat som `test:stability:blocking` i quality-core och fäller
 * då `quality`. Denna config används både av den blockerande subseten och av
 * den warn-only `stability`-lanen.
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
