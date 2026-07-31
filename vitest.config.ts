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

/**
 * Postgres-lane-filer: `*.postgres.test.ts` körs ENBART av
 * `npm run test:postgres` (egen config: `vitest.postgres.config.ts`), mot en
 * riktig databas.
 *
 * Varför de exkluderas här i stället för att bara skippa sig själva: de kräver
 * `POSTGRES_URL` i processen, och standard-sviten körs medvetet UTAN databas.
 * Flera tester verifierar att appen degraderar snyggt när DB saknas — sätter man
 * en URL för hela `test:ci` ändras förutsättningen för dem tyst. Egen lane
 * håller den skiljelinjen tydlig i stället för att låta en env-variabel avgöra
 * vad hundratals tester tror om världen.
 */
export const POSTGRES_TEST_GLOBS = ["**/*.postgres.test.ts"];

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
      "@": path.resolve(__dirname, "src"),
      // clerk-auth dossier components import the GENERATED site's dependency
      // `@clerk/nextjs` (not installed in this repo). Alias to an inert stub
      // so the demo-mode branch is unit-testable (dossier-config-fallback).
      // The subpath must come FIRST — Vite matches string aliases by prefix,
      // so the package-root entry would otherwise rewrite `/server` imports
      // (the dossier middleware) onto the root stub.
      "@clerk/nextjs/server": path.resolve(__dirname, "tests/stubs/clerk-nextjs-server.ts"),
      "@clerk/nextjs": path.resolve(__dirname, "tests/stubs/clerk-nextjs.tsx"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Minimal jsdom polyfills for layout/observation APIs the @shadcn/react
    // MessageScroller primitive needs (ResizeObserver/IntersectionObserver/
    // element scroll methods). See vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
    // Only this repo's suites — never vendor trees under data/ (repo-cache tests).
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
    ],
    exclude: [...SHARED_TEST_EXCLUDE, ...STABILITY_TEST_GLOBS, ...POSTGRES_TEST_GLOBS],
  },
});
