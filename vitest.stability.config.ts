import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { SHARED_TEST_EXCLUDE, STABILITY_TEST_GLOBS } from "./vitest.config";

/**
 * Lane-config för lokal `npm run test:stability` och blockerande CI.
 *
 * Kör ENBART stabilitetsfiler (`*.stability.test.ts(x)`). Standard-configen
 * (`vitest.config.ts`) exkluderar samma glob från `test:ci`. Den deterministiska
 * mängden körs separat som `test:stability:blocking` i quality-core och fäller
 * då `quality`. Discovery kräver att configens faktiska filmängd motsvarar
 * den granskade blockerande mängden; ingen extra warn-only CI-körning behövs.
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
