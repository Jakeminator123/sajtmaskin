/**
 * Direct materialization dependencies for dossier acceptance builds.
 *
 * `buildDossierAcceptanceProject` overlays dossier files on the landing-page
 * scaffold, then `buildCompleteProject` fills the export baseline and copies
 * host `src/components/ui/*` sources that the generated files import.
 * Changing anything listed here can change install / typecheck / production
 * build of a materialized site. Variants under `config/scaffold-variants/`
 * and non-landing scaffolds are a separate visual subsystem and are not
 * imported by the acceptance materializer.
 */
export const DOSSIER_ACCEPTANCE_PATH_CONTRACT = Object.freeze([
  {
    pattern: ".github/workflows/dossier-acceptance.yml",
    reason: "Workflow self-coverage: trigger, scope gate and aggregate must re-run when they change.",
  },
  {
    pattern: "data/dossiers/**",
    reason: "Runtime dossier source of truth — manifests and shipped files become the generated site.",
  },
  {
    pattern: "scripts/dossiers/**",
    reason: "Materializer, matrix discovery and this path-scope contract drive the workflow.",
  },
  {
    pattern: "src/lib/gen/dossiers/**",
    reason: "Acceptance project builder, registry and output-path mapping assemble the site.",
  },
  {
    pattern: "src/lib/gen/export/**",
    reason: "Export baseline owner (`project-scaffold` + UI reader) completes package/tsconfig/framework files.",
  },
  {
    pattern: "src/lib/gen/scaffolds/landing-page/**",
    reason: "Acceptance hardcodes the common landing-page scaffold as the starting file set.",
  },
  {
    pattern: "src/lib/gen/scaffolds/load-scaffold-files.ts",
    reason: "Disk loader that materializes landing-page `files/` into the scaffold manifest.",
  },
  {
    pattern: "src/lib/gen/autofix/dep-completer.ts",
    reason: "Resolves deterministic export ranges and reads host package.json pins.",
  },
  {
    pattern: "src/lib/gen/data/shadcn-components.ts",
    reason: "Baseline export scaffold consults the shadcn component catalog.",
  },
  {
    pattern: "src/lib/gen/parser.ts",
    reason: "Shared generated-file type used while assembling the acceptance project.",
  },
  {
    pattern: "src/lib/gen/preview/env-local.ts",
    reason: "Baseline `.env.local` placeholders used by the keyless production build.",
  },
  {
    pattern: "src/lib/utils/infer-file-language.ts",
    reason: "Language tagging for every materialized file.",
  },
  {
    pattern: "src/lib/utils/path-utils.ts",
    reason: "Dossier registry rejects traversal segments while reading shipped files.",
  },
  {
    pattern: "src/components/ui/**",
    reason: "UI reader copies matching `@/components/ui/*` sources into the generated project.",
  },
  {
    pattern: "components/ui/**",
    reason: "Secondary UI-reader search root if a generated project layout uses the unprefixed tree.",
  },
  {
    pattern: ".node-version",
    reason: "Workflow Node version for host materializer and generated-project typecheck/build.",
  },
  {
    pattern: ".nvmrc",
    reason: "Kept in lockstep with `.node-version`; a drift here changes local/CI Node selection.",
  },
  {
    pattern: "package.json",
    reason: "Host dependency pins (`dep-completer`) and `npm ci` for the materializer.",
  },
  {
    pattern: "package-lock.json",
    reason: "Lockfile for the host install that runs the materializer.",
  },
]);

export const DOSSIER_ACCEPTANCE_PATHS = Object.freeze(
  DOSSIER_ACCEPTANCE_PATH_CONTRACT.map((entry) => entry.pattern),
);
