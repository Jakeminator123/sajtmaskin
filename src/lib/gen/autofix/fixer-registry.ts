/**
 * Fixer Registry — single source of truth for every fixer/validator the
 * generation pipeline runs. Built so a reader can answer "what touches our
 * generated code, where does it run, what failure mode does it catch?"
 * without grep:ing through 40+ files.
 *
 * Categories follow the lifecycle the fixer participates in:
 *
 * - `mechanical-*` — pure function, runs synchronously inside `runAutoFix()`
 *   in `pipeline.ts`. Cheap, deterministic, no LLM.
 * - `validator-*` — read-only check that may emit warnings/errors. Esbuild
 *   syntax validator, jsx checker, dep version validator.
 * - `llm-*` — LLM-backed repair. Costs reasoning tokens. Triggered when a
 *   validator failed.
 * - `verifier-*` — verifier-pass + verifier-fixer (optional re-verify when
 *   `FEATURES.verifierRerunAfterFix` is on).
 * - `repair-loop-*` — server-side repair loop (`repair-loop.ts`).
 *
 * Backoffice (`backoffice/pages/fixer_registry.py`) renders this list as a
 * grouped table so the user can see status, owner phase, and telemetry
 * counter at a glance.
 *
 * Adding a new fixer:
 *  1. Implement and wire it into the appropriate runner.
 *  2. Append a `FixerRegistryEntry` here with full metadata.
 *  3. The parity test in `fixer-registry.test.ts` will fail unless every
 *     fixer ID emitted by `runAutoFix` is also in this registry.
 */

export type FixerCategory =
  | "mechanical-import"
  | "mechanical-syntax"
  | "mechanical-jsx"
  | "mechanical-shadcn"
  | "mechanical-r3f"
  | "mechanical-tailwind"
  | "mechanical-meta"
  | "mechanical-next-config"
  | "mechanical-misc"
  | "validator-syntax"
  | "validator-jsx"
  | "validator-dep"
  | "llm-syntax"
  | "llm-verifier"
  | "llm-partial-file"
  | "llm-server-repair"
  | "verifier-pass";

export type FixerOwnerPhase =
  | "pre-syntax"
  | "post-syntax"
  | "verifier"
  | "post-merge"
  | "preflight"
  | "server-repair";

export type FixerStatus = "active" | "deprecated" | "experimental";

export interface FixerRegistryEntry {
  /** Stable id. MUST match the string emitted in `FixEntry.fixer`. */
  id: string;
  category: FixerCategory;
  /** Path relative to repo root. */
  sourcePath: string;
  /** What kind of model/runtime fault this fixer addresses. */
  targetFailureMode: string;
  /** Triggers/patterns/error codes that activate the fixer. */
  triggers: string[];
  status: FixerStatus;
  ownerPhase: FixerOwnerPhase;
  /** Prometheus/dev metric counter name (when wired). */
  telemetryCounter?: string;
  /** Free text — design decisions, links to plans, deprecation notes. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Entries — order roughly mirrors execution order in pipeline.ts comments.
// ---------------------------------------------------------------------------

export const FIXER_REGISTRY: readonly FixerRegistryEntry[] = [
  // ---- mechanical: pre-syntax ----
  {
    id: "escape-leakage-fixer",
    category: "mechanical-syntax",
    sourcePath: "src/lib/gen/autofix/rules/escape-leakage-fixer.ts",
    targetFailureMode: "JSON-double-encoded file content (literal \\n, \\\")",
    triggers: ["literal `\\n` in source", "outer quotes wrapping file content"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "use-client-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/use-client-fixer.ts",
    targetFailureMode: "Missing `\"use client\"` directive on client components",
    triggers: ["client hooks", "event handlers", "browser APIs", "framer-motion import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tier3-sdk-guard-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/tier3-sdk-guard-fixer.ts",
    targetFailureMode: "Backend SDK imports leaking into F2 design phase",
    triggers: ["import from tier-3 SDK in F2"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Active when previewPolicy !== 'fidelity3'.",
  },
  {
    id: "import-validator",
    category: "mechanical-shadcn",
    sourcePath: "src/lib/gen/autofix/import-validator.ts",
    targetFailureMode: "Wrong shadcn import paths",
    triggers: ["@/components/ui/* import path mismatch"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "react-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/react-import-consolidated.ts",
    targetFailureMode: "Missing `import React`",
    triggers: ["React reference without import"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "E5 (OMTAG fas 2·C): consolidated with react-hook-import-fixer and " +
      "nextjs-navigation-import-fixer into a single implementation. IDs " +
      "preserved for stable telemetry/backoffice rendering.",
  },
  {
    id: "react-hook-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/react-import-consolidated.ts",
    targetFailureMode: "Missing named React hook imports (useState etc.)",
    triggers: ["hook call without import"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Shares implementation with react-import-fixer (see E5 notes).",
  },
  {
    id: "nextjs-navigation-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/react-import-consolidated.ts",
    targetFailureMode: "Missing next/navigation hook imports (usePathname etc.)",
    triggers: ["next/navigation hook call without import"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Shares implementation with react-import-fixer (see E5 notes).",
  },
  {
    id: "react-type-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing common React type imports (ReactNode etc.)",
    triggers: ["ReactNode type usage without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "import-alias-type-syntax-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/import-alias-type-syntax-fixer.ts",
    targetFailureMode: "Invalid `X as type Y` hybrid specifier rejected by SWC",
    triggers: ["`<Ident> as type <Ident>` inside import specifier list"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Recurring pattern in site-observability (LucideIcon aliasing). Runs before type-only-import-fixer.",
  },
  {
    id: "type-only-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/type-only-import-fixer.ts",
    targetFailureMode: "TS2749 — value-import of type-only binding",
    triggers: ["import {X} where X is only used as a type"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Documented in docs/plans/active/P31-feature-runtime-envs-and-f3-toggle.md.",
  },
  {
    id: "value-used-from-type-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/value-used-from-type-import-fixer.ts",
    targetFailureMode: "TS1361 — type-only import used as runtime value (JSX, call, new, member)",
    triggers: [
      "`import type { X }` + `<X />` JSX, `X()`, `new X()`, or `X.foo` in same file",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Mirror of type-only-import-fixer (value↔type). Runs AFTER it so correct value→type conversions are not undone. Empirical hit 2026-04-23 (/showcase white page).",
  },
  {
    id: "dom-builtin-jsx-fixer",
    category: "mechanical-jsx",
    sourcePath: "src/lib/gen/autofix/rules/dom-builtin-jsx-fixer.ts",
    targetFailureMode:
      "DOM interface names (HTMLFormElement, HTMLInputElement, …) used as JSX tags",
    triggers: ["<HTMLxxxElement> or <SVGxxxElement> as JSX"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Rewrites to correct lowercase HTML tag via curated map; falls back to <div> + warning for unknown names. Uses a negative-lookbehind so `FormEvent<HTMLFormElement>` generic is left alone.",
  },
  {
    id: "duplicate-import-local-type-collision-fixer",
    category: "mechanical-import",
    sourcePath:
      "src/lib/gen/autofix/rules/duplicate-import-local-type-collision-fixer.ts",
    targetFailureMode:
      "Two default imports of same source with different local names; or import + local `export type` name collision (TS2300/TS2440)",
    triggers: [
      "`import A from \"./m\"; import B from \"./m\";`",
      "`import X from \"./m\"; export type X = ...;` in same file",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Complements duplicate-import-binding-fixer (which handles same-name from different sources). Runs after it.",
  },
  {
    id: "type-only-module-default-import-fixer",
    category: "mechanical-import",
    sourcePath:
      "src/lib/gen/autofix/rules/type-only-module-default-import-fixer.ts",
    targetFailureMode:
      "Default import of a module that only `export type X` — no runtime default",
    triggers: [
      "`import X from \"@/components/foo\"` where `foo.tsx` only declares `export type X`",
    ],
    status: "active",
    ownerPhase: "post-merge",
    notes:
      "Cross-file pass wired into finalize-merge.ts alongside checkCrossFileImports. Only drops when the default binding is unused as a value in the importer.",
  },
  {
    id: "next-image-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing `next/image` import",
    triggers: ["<Image /> JSX without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "next-og-image-response-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing `ImageResponse` from `next/og`",
    triggers: ["ImageResponse usage in /opengraph-image"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-symbol-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing import for shared local config/data symbols",
    triggers: ["uniquely exported local symbol referenced without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-named-import-default-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Local named-import for a default export",
    triggers: ["import {X} for module exporting default X"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-default-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Local default-import for a named export",
    triggers: ["import X from local module exporting only named X"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "import-declaration-conflict-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Imports shadowing local declarations",
    triggers: ["import binding identical to local const/function"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "duplicate-import-binding-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/duplicate-import-binding-fixer.ts",
    targetFailureMode: "Same identifier imported from two sources",
    triggers: ["duplicate import bindings across statements"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "metadata-import-fixer",
    category: "mechanical-meta",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `Metadata` type import in page/layout",
    triggers: ["export const metadata: Metadata without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "metadata-route-import-fixer",
    category: "mechanical-meta",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `MetadataRoute` import",
    triggers: ["sitemap/robots route without MetadataRoute type"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "cn-import-conflict-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Conflicting local cn import",
    triggers: ["local function named cn shadowing @/lib/utils cn"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "cn-import-fixer",
    category: "mechanical-import",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `cn` import from @/lib/utils",
    triggers: ["cn() call without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "lucide-image-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/rules/lucide-misuse-fixer.ts",
    targetFailureMode: "Image imported from lucide-react when next/image meant",
    triggers: ["lucide-react Image used as component"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "lucide-link-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/rules/lucide-misuse-fixer.ts",
    targetFailureMode: "Link imported from lucide-react when next/link meant",
    triggers: ["lucide-react Link used as component"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tailwind-font-arbitrary-fixer",
    category: "mechanical-tailwind",
    sourcePath: "src/lib/gen/autofix/rules/tailwind-font-arbitrary-fixer.ts",
    targetFailureMode: "Unsupported font-[family-name:var(--x)] arbitrary class",
    triggers: ["font-[family-name:var(--…)] in className"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "font-import-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/rules/font-import-fixer.ts",
    targetFailureMode: "Layout font imports missing/incorrect",
    triggers: ["next/font import in app/layout.tsx"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "metadata-client-conflict-fixer",
    category: "mechanical-meta",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: '"use client" + static metadata export — invalid in App Router',
    triggers: ['both "use client" directive and metadata export present'],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "icon-component-value-fixer",
    category: "mechanical-jsx",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "Raw icon component values used as keys/render values",
    triggers: ["key={x.icon}", "{x.icon} as JSX child"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "as-const-boolean-keys",
    category: "mechanical-syntax",
    sourcePath: "src/lib/gen/autofix/rules/as-const-boolean-keys.ts",
    targetFailureMode: "Nav arrays needing `as const` for TS literal inference",
    triggers: ["array literal with boolean discriminant inferred wide"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "r3f-vector-tuple-fixer",
    category: "mechanical-r3f",
    sourcePath: "src/lib/gen/autofix/rules/r3f-vector-tuple-fixer.ts",
    targetFailureMode: "TS2322 on R3F position/scale/rotation/args (number[] vs tuple)",
    triggers: ["3-number array literal in R3F prop"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Documented in docs/plans/avklarat/P30-r3f-tuple-and-repair-feedback.md.",
  },
  {
    id: "scroll-smooth-html-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "scroll-smooth className on <html> incompatible with Next.js 16",
    triggers: ["<html className=…scroll-smooth…>"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "scroll-smooth-css-fixer",
    category: "mechanical-misc",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "scroll-behavior: smooth in CSS breaking preview/HMR",
    triggers: ["scroll-behavior: smooth in *.css"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tier2-preview-basepath-next-config",
    category: "mechanical-next-config",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "next.config missing basePath for preview-host URLs",
    triggers: ["next.config without SAJTMASKIN_PREVIEW_BASE_PATH handling"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tailwind-apply-component-fixer",
    category: "mechanical-tailwind",
    sourcePath: "src/lib/gen/autofix/rules/tailwind-apply-component-fixer.ts",
    targetFailureMode: "Tailwind v4 @apply of @layer components classes (build break)",
    triggers: ["@apply of component-layer class in *.css"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "next-config-remote-patterns",
    category: "mechanical-next-config",
    sourcePath: "src/lib/gen/autofix/repair-generated-files.ts",
    targetFailureMode: "next.config images.remotePatterns missing required hosts",
    triggers: ["external image hosts referenced without remotePatterns entry"],
    status: "active",
    ownerPhase: "post-merge",
  },
  {
    id: "duplicate-default-export-fixer",
    category: "mechanical-jsx",
    sourcePath: "src/lib/gen/autofix/repair-generated-files.ts",
    targetFailureMode: "Two `export default` statements in the same file",
    triggers: ["duplicate export default"],
    status: "active",
    ownerPhase: "post-merge",
  },
  {
    id: "layout-provider-fixer",
    category: "mechanical-jsx",
    sourcePath: "src/lib/gen/autofix/rules/layout-provider-fixer.ts",
    targetFailureMode: "Missing required provider in layout (Theme/Auth/etc.)",
    triggers: ["provider hook usage in tree without layout-level provider"],
    status: "active",
    ownerPhase: "post-merge",
  },
  // ---- validators (read-only, may emit warnings) ----
  {
    id: "syntax-validator",
    category: "validator-syntax",
    sourcePath: "src/lib/gen/autofix/syntax-validator.ts",
    targetFailureMode: "Esbuild transform errors per file",
    triggers: ["esbuild transform fail"],
    status: "active",
    ownerPhase: "post-syntax",
    telemetryCounter: "sajtmaskin_syntax_validator_total",
  },
  {
    id: "jsx-checker",
    category: "validator-jsx",
    sourcePath: "src/lib/gen/autofix/jsx-checker.ts",
    targetFailureMode: "JSX tag mismatch / missing default export",
    triggers: ["unbalanced JSX tags", "missing default export in route file"],
    status: "active",
    ownerPhase: "post-syntax",
  },
  {
    id: "dep-completer",
    category: "validator-dep",
    sourcePath: "src/lib/gen/autofix/dep-completer.ts",
    targetFailureMode: "Third-party deps used in code but missing from package.json",
    triggers: ["import from non-builtin without package.json entry"],
    status: "active",
    ownerPhase: "post-syntax",
  },
  {
    id: "dep-version-validator",
    category: "validator-dep",
    sourcePath: "src/lib/gen/autofix/dep-version-validator.ts",
    targetFailureMode: "Invalid dep versions causing npm install ENOENT",
    triggers: ["dep version not satisfiable on npm registry"],
    status: "active",
    ownerPhase: "post-syntax",
    notes: "Last line of defense before preview-VM npm install.",
  },
  // ---- LLM repair phases ----
  {
    id: "llm-syntax-fixer",
    category: "llm-syntax",
    sourcePath: "src/lib/gen/autofix/llm-fixer.ts",
    targetFailureMode: "Syntax/typecheck errors after mechanical autofix",
    triggers: ["validateAndFix() escalates to LLM after mechanical pass"],
    status: "active",
    ownerPhase: "post-syntax",
    telemetryCounter: 'sajtmaskin_fixer_call_total{phase="syntax"}',
    notes: "Bounded by syntaxFixPasses (1–4) and time budget.",
  },
  {
    id: "llm-verifier-fixer",
    category: "llm-verifier",
    sourcePath: "src/lib/gen/stream/finalize-version/verifier-phase.ts",
    targetFailureMode: "Verifier-blocking findings (SEO, a11y, semantics)",
    triggers: ["verifier blocking findings > 0"],
    status: "active",
    ownerPhase: "verifier",
    telemetryCounter: 'sajtmaskin_fixer_call_total{phase="verifier"}',
    notes:
      "When FEATURES.verifierRerunAfterFix=true the verifier re-runs once " +
      "after this fixer pass to confirm the fix actually addressed the finding.",
  },
  {
    id: "llm-partial-file-repair",
    category: "llm-partial-file",
    sourcePath: "src/lib/gen/stream/finalize-version/partial-file.ts",
    targetFailureMode: "Truncated/partial file content from generation stream",
    triggers: ["preflight detects partial-file artefact"],
    status: "active",
    ownerPhase: "preflight",
    telemetryCounter: 'sajtmaskin_partial_file_repair_total',
    notes: "Capped by PARTIAL_FILE_REPAIR_MAX_ATTEMPTS.",
  },
  {
    id: "llm-server-repair",
    category: "llm-server-repair",
    sourcePath: "src/lib/gen/verify/repair-loop.ts",
    targetFailureMode: "Quality-gate / server-verify failures (build-time)",
    triggers: ["server-verify or quality-gate fails"],
    status: "active",
    ownerPhase: "server-repair",
    telemetryCounter: 'sajtmaskin_fixer_call_total{phase="server"}',
    notes: "Up to maxLlmPasses with early-stop policy.",
  },
  // ---- verifier-pass itself (read-only LLM) ----
  {
    id: "verifier-pass",
    category: "verifier-pass",
    sourcePath: "src/lib/gen/verify/verifier-pass.ts",
    targetFailureMode: "Read-only LLM check for blocking + quality findings",
    triggers: ["verifier policy says 'run' for this version"],
    status: "active",
    ownerPhase: "verifier",
    telemetryCounter: "sajtmaskin_verifier_blocking_total",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REGISTRY_BY_ID = new Map<string, FixerRegistryEntry>(
  FIXER_REGISTRY.map((entry) => [entry.id, entry]),
);

export function getFixerById(id: string): FixerRegistryEntry | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function listFixersByCategory(): Record<FixerCategory, FixerRegistryEntry[]> {
  const grouped = {} as Record<FixerCategory, FixerRegistryEntry[]>;
  for (const entry of FIXER_REGISTRY) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }
  return grouped;
}

export function listFixersByPhase(): Record<FixerOwnerPhase, FixerRegistryEntry[]> {
  const grouped = {} as Record<FixerOwnerPhase, FixerRegistryEntry[]>;
  for (const entry of FIXER_REGISTRY) {
    if (!grouped[entry.ownerPhase]) grouped[entry.ownerPhase] = [];
    grouped[entry.ownerPhase].push(entry);
  }
  return grouped;
}

/** All fixer IDs that should appear in `runAutoFix` `FixEntry.fixer`. */
export function getMechanicalFixerIds(): readonly string[] {
  return FIXER_REGISTRY
    .filter((e) => e.category.startsWith("mechanical-"))
    .map((e) => e.id);
}

/** Total registry size (handy for dashboards / docs). */
export const FIXER_REGISTRY_SIZE = FIXER_REGISTRY.length;
