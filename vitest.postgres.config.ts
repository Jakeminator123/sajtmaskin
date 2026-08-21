import { defineConfig } from "vitest/config";
import path from "path";
import { POSTGRES_TEST_GLOBS, SHARED_TEST_EXCLUDE } from "./vitest.config";
import { linkedWorktreeVitestPool } from "./scripts/dev/linked-worktree-vitest-pool";

/**
 * Lane-config för `npm run test:postgres` — DB-backade kontraktstester mot en
 * RIKTIG Postgres.
 *
 * Kör enbart `*.postgres.test.ts`, som standard-configen exkluderar. Skälet står
 * vid `POSTGRES_TEST_GLOBS` i `vitest.config.ts`: standard-sviten körs medvetet
 * utan databas, och flera tester bygger på det.
 *
 * `environment: "node"` (inte jsdom) — dessa tester öppnar en `pg`-pool och rör
 * ingen DOM. Filerna bär även `// @vitest-environment node` så de gör rätt även
 * om någon kör dem via en annan config.
 *
 * Skippar sig själva när ingen dev-databas finns, med ett utskrivet skäl. De
 * vägrar dessutom allt utom en dev-target — identiteten avgörs av
 * `scripts/db/check-db-env-target.mjs`, inte av testet.
 *
 * **Inget `--passWithNoTests` på den här lanen, med flit.** Stability-lanen har
 * flaggan eftersom den legitimt kan vara tom; den här får inte vara det. Filens
 * egen `REQUIRE_POSTGRES_TESTS`-grind kan bara larma om filen faktiskt laddas —
 * döps globen om eller filen bort skulle flaggan göra steget grönt med noll
 * assertions, alltså precis den false-green lanen finns för att stänga. Utan
 * flaggan faller `vitest run` på "No test files found".
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: POSTGRES_TEST_GLOBS,
    exclude: SHARED_TEST_EXCLUDE,
    ...linkedWorktreeVitestPool(__dirname),
  },
});
