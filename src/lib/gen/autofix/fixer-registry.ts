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
 * - `verifier-*` — verifier-pass + verifier-fixer (always re-verifies once
 *   after the fixer rewrites a file; see `verifier-phase.ts`).
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
export type FixerRisk = "safe" | "risky";

export interface FixerRegistryEntry {
  /** Stable id. MUST match the string emitted in `FixEntry.fixer`. */
  id: string;
  category: FixerCategory;
  /**
   * Risk class for verifier-policy decisions. `safe` fixers are narrow,
   * deterministic hygiene changes; `risky` fixers can alter structure,
   * cross-file contracts, dependencies, or LLM-generated content.
   */
  risk: FixerRisk;
  /** Path relative to repo root. */
  sourcePath: string;
  /** What kind of model/runtime fault this fixer addresses. */
  targetFailureMode: string;
  /** Triggers/patterns/error codes that activate the fixer. */
  triggers: string[];
  status: FixerStatus;
  ownerPhase: FixerOwnerPhase;
  /**
   * Additional lifecycle phases that ALSO run this fixer. `ownerPhase` stays
   * the primary/grouping phase; multi-phase fixers (e.g. the diagnostic-driven
   * import repair that runs in both finalize normalize and server-repair) list
   * their secondary phases here.
   */
  additionalOwnerPhases?: FixerOwnerPhase[];
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/escape-leakage-fixer.ts",
    targetFailureMode: "JSON-double-encoded file content (literal \\n, \\\")",
    triggers: ["literal `\\n` in source", "outer quotes wrapping file content"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "media-alias-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/media-alias-fixer.ts",
    targetFailureMode:
      "Leaked `{{MEDIA_n}}`/`{{URL_n}}` URL-compression aliases persisting past finalize (next/image src parse crash at build/SSG)",
    triggers: [
      "`{{MEDIA_n}}` or `{{URL_n}}` alias in file content (tolerant: whitespace, `-` separator)",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "M#oc1: `expandUrls` runs exactly once in finalize (pre-phases.ts); LLM repair " +
      "passes (verifier-fixer, partial-file, server repair-loop) can re-introduce " +
      "aliases from prompt context. The urlMap is stream-scoped, so this fixer " +
      "replaces leaked aliases with the same /placeholder.svg fallback that " +
      "expandUrls uses for unresolved aliases. Runs on every language.",
  },
  {
    id: "use-client-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "Missing `\"use client\"` directive on client components",
    triggers: ["client hooks", "event handlers", "browser APIs", "framer-motion import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tier3-sdk-guard-fixer",
    category: "mechanical-import",
    risk: "risky",
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
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/import-validator.ts",
    targetFailureMode: "Wrong shadcn import paths",
    triggers: ["@/components/ui/* import path mismatch"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "react-import-fixer",
    category: "mechanical-import",
    risk: "safe",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/react-import-consolidated.ts",
    targetFailureMode:
      "Missing named React hook imports (useState etc.); also TS2300 from duplicate `react` imports",
    triggers: [
      "hook call without import",
      "2+ `import ... from \"react\"` re-declaring the same local name",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Shares implementation with react-import-fixer (see E5 notes). Also " +
      "consolidates duplicate react imports (mix of `import type {…}` + value " +
      "`import {…}`, or inline `type X` duplicated) into a single value import " +
      "+ a single `import type`, de-duping specifiers, before adding any " +
      "missing hooks.",
  },
  {
    id: "nextjs-navigation-import-fixer",
    category: "mechanical-import",
    risk: "safe",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing common React type imports (ReactNode etc.)",
    triggers: ["ReactNode type usage without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "import-alias-type-syntax-fixer",
    category: "mechanical-import",
    risk: "safe",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/type-only-import-fixer.ts",
    targetFailureMode: "TS2749 — value-import of type-only binding",
    triggers: ["import {X} where X is only used as a type"],
    status: "active",
    ownerPhase: "pre-syntax",
    notes: "Documented in docs/plans/avklarat/P31-feature-runtime-envs-and-f3-toggle.md.",
  },
  {
    id: "value-used-from-type-import-fixer",
    category: "mechanical-import",
    risk: "safe",
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
    risk: "risky",
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
    risk: "safe",
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
    risk: "risky",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing `next/image` import",
    triggers: ["<Image /> JSX without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "next-og-image-response-import-fixer",
    category: "mechanical-import",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing `ImageResponse` from `next/og`",
    triggers: ["ImageResponse usage in /opengraph-image"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-symbol-import-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Missing import for shared local config/data symbols",
    triggers: ["uniquely exported local symbol referenced without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-named-import-default-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Local named-import for a default export",
    triggers: ["import {X} for module exporting default X"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "local-default-import-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Local default-import for a named export",
    triggers: ["import X from local module exporting only named X"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "import-declaration-conflict-fixer",
    category: "mechanical-import",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/common-import-fixer.ts",
    targetFailureMode: "Imports shadowing local declarations",
    triggers: ["import binding identical to local const/function"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "global-shadow-import-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/rules/global-shadow-import-fixer.ts",
    targetFailureMode:
      "Local import binding shadows a JS/Web global (e.g. `import Date from \"@/components/date\"`), breaking `new Date()` at runtime + tsc",
    triggers: [
      "local (@/, ./, ../) import whose name is a global (Date, Map, Image, Promise, …)",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "name-guard. AST-based (cannot emit broken syntax). Drops the binding when " +
      "it is not used as a JSX component; aliases it + rewrites JSX tags when it is. " +
      "Never touches package imports (next/image's Image is intentional). " +
      "Complements import-declaration-conflict-fixer (local shadowing).",
  },
  {
    id: "duplicate-import-binding-fixer",
    category: "mechanical-import",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/duplicate-import-binding-fixer.ts",
    targetFailureMode: "Same identifier imported from two sources",
    triggers: ["duplicate import bindings across statements"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "ts2304-known-import-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/rules/ts2304-known-import-fixer.ts",
    targetFailureMode:
      "TS2304/TS2552 missing import for a name resolvable with certainty (lucide icon, known module specifier, shadcn component, Next default, Clerk server helper, Stripe SDK)",
    triggers: [
      "warm-tsc / quality-gate tsc `Cannot find name 'X'` where X resolves to a known module",
    ],
    status: "active",
    ownerPhase: "post-syntax",
    additionalOwnerPhases: ["server-repair"],
    notes:
      "Diagnostic-driven (consumes tsc output) rather than a JSX scan, so it " +
      "also catches non-JSX value usages. Runs in the shared deterministic " +
      "import-repair (autofix/deterministic-import-repair.ts) BEFORE any LLM " +
      "fixer, from BOTH entrypoints: the finalize normalize pass on warm-tsc " +
      "failure (validate-and-fix.ts) and the server repair-loop pre-pass " +
      "(verify/repair-loop.ts). shadcn∩lucide collision names (Badge, Calendar, " +
      "Table, …) are resolved usage-aware (M#badge1): children/variant/asChild → " +
      "shadcn, icon-ish self-closing → lucide, unclear → left for the LLM. Stripe " +
      "resolves only in API route / route-handler files. Tier-3 backend SDKs " +
      "(Clerk-server, Stripe) are only (re)introduced in F3 (fidelity3); in F2 " +
      "they stay residual so the F2 SDK guard is never undone.",
  },
  {
    id: "own-component-import-fixer",
    category: "mechanical-import",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/deterministic-import-repair.ts",
    targetFailureMode:
      "TS2304 missing import for a component/symbol the version's OWN files export (e.g. `Reveal` in components/reveal.tsx) — not a library name",
    triggers: [
      "warm-tsc / quality-gate tsc `Cannot find name 'X'` where X is NOT a known-library name and exactly one own project file exports it",
    ],
    status: "active",
    ownerPhase: "post-syntax",
    additionalOwnerPhases: ["server-repair"],
    notes:
      "Fas 1 kontrollflöde: closes the own-component TS2304 class (prod 14d: " +
      "Reveal 14 hits). Classification only — known library vs own file vs " +
      "unknown; no component registry. Named exports reuse the unique-candidate " +
      "injector (fixMissingLocalSymbolImports); default exports resolve when " +
      "exactly one shared own file default-exports the name. Unknown names keep " +
      "existing behaviour (cross-file-checker/stub downstream) — normalize never " +
      "creates new silent stubs.",
  },
  {
    id: "metadata-import-fixer",
    category: "mechanical-meta",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `Metadata` type import in page/layout",
    triggers: ["export const metadata: Metadata without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "metadata-route-import-fixer",
    category: "mechanical-meta",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `MetadataRoute` import",
    triggers: ["sitemap/robots route without MetadataRoute type"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "cn-import-conflict-fixer",
    category: "mechanical-import",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Conflicting local cn import",
    triggers: ["local function named cn shadowing @/lib/utils cn"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "cn-import-fixer",
    category: "mechanical-import",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/metadata-import-fixer.ts",
    targetFailureMode: "Missing `cn` import from @/lib/utils",
    triggers: ["cn() call without import"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "lucide-image-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/lucide-misuse-fixer.ts",
    targetFailureMode: "Image imported from lucide-react when next/image meant",
    triggers: ["lucide-react Image used as component"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "lucide-link-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/lucide-misuse-fixer.ts",
    targetFailureMode: "Link imported from lucide-react when next/link meant",
    triggers: ["lucide-react Link used as component"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "lucide-shadcn-collision-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/lucide-misuse-fixer.ts",
    targetFailureMode:
      "shadcn∩lucide name (Badge, Calendar, Command, Form, Sheet, Sidebar, Table) " +
      "imported from lucide-react but used as the shadcn component — renders an " +
      "svg glyph whose children are invalid HTML (hydration mismatch)",
    triggers: [
      "lucide-react collision import used with children or variant=/asChild",
    ],
    status: "active",
    ownerPhase: "pre-syntax",
    notes:
      "Usage-driven: paired tags/children or shadcn-only props flip the import " +
      "to @/components/ui/<subpath>; icon-only usages in the same file keep the " +
      "glyph as <XIcon/>. Added after prod chat 1c34592c v3 (follow-up rewrote " +
      "the Badge import to lucide-react and every validator accepted it).",
  },
  {
    id: "tailwind-font-arbitrary-fixer",
    category: "mechanical-tailwind",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "Unsupported font-[family-name:var(--x)] arbitrary class",
    triggers: ["font-[family-name:var(--…)] in className"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "font-import-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/font-import-fixer.ts",
    targetFailureMode: "Layout font imports missing/incorrect",
    triggers: ["next/font import in app/layout.tsx"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "metadata-client-conflict-fixer",
    category: "mechanical-meta",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: '"use client" + static metadata export — invalid in App Router',
    triggers: ['both "use client" directive and metadata export present'],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "icon-component-value-fixer",
    category: "mechanical-jsx",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "Raw icon component values used as keys/render values",
    triggers: ["key={x.icon}", "{x.icon} as JSX child"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "as-const-boolean-keys",
    category: "mechanical-syntax",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/as-const-boolean-keys.ts",
    targetFailureMode: "Nav arrays needing `as const` for TS literal inference",
    triggers: ["array literal with boolean discriminant inferred wide"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "r3f-vector-tuple-fixer",
    category: "mechanical-r3f",
    risk: "safe",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "scroll-smooth className on <html> incompatible with Next.js 16",
    triggers: ["<html className=…scroll-smooth…>"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "scroll-smooth-css-fixer",
    category: "mechanical-misc",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "scroll-behavior: smooth in CSS breaking preview/HMR",
    triggers: ["scroll-behavior: smooth in *.css"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tier2-preview-basepath-next-config",
    category: "mechanical-next-config",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "next.config missing basePath for preview-host URLs",
    triggers: ["next.config without SAJTMASKIN_PREVIEW_BASE_PATH handling"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "tailwind-apply-component-fixer",
    category: "mechanical-tailwind",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/rules/tailwind-apply-component-fixer.ts",
    targetFailureMode: "Tailwind v4 @apply of @layer components classes (build break)",
    triggers: ["@apply of component-layer class in *.css"],
    status: "active",
    ownerPhase: "pre-syntax",
  },
  {
    id: "next-config-remote-patterns",
    category: "mechanical-next-config",
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/repair-generated-files.ts",
    targetFailureMode: "next.config images.remotePatterns missing required hosts",
    triggers: ["external image hosts referenced without remotePatterns entry"],
    status: "active",
    ownerPhase: "post-merge",
  },
  {
    id: "duplicate-default-export-fixer",
    category: "mechanical-jsx",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/repair-generated-files.ts",
    targetFailureMode: "Two `export default` statements in the same file",
    triggers: ["duplicate export default"],
    status: "active",
    ownerPhase: "post-merge",
  },
  {
    id: "layout-provider-fixer",
    category: "mechanical-jsx",
    risk: "risky",
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
    risk: "safe",
    sourcePath: "src/lib/gen/autofix/pipeline.ts",
    targetFailureMode: "Esbuild transform errors per file",
    triggers: ["esbuild transform fail"],
    status: "active",
    ownerPhase: "post-syntax",
    telemetryCounter: "sajtmaskin_syntax_validator_total",
  },
  {
    id: "jsx-checker",
    category: "validator-jsx",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/jsx-checker.ts",
    targetFailureMode: "JSX tag mismatch / missing default export",
    triggers: ["unbalanced JSX tags", "missing default export in route file"],
    status: "active",
    ownerPhase: "post-syntax",
    notes:
      "Tag-mismatch warnings are parse-gated: they are only emitted when the " +
      "TS parser confirms the file does not parse (a genuinely unclosed/" +
      "mis-paired JSX tag always breaks parsing). This stops false " +
      "preview-blocking findings on valid 3D/R3F shapes the count regexes " +
      "mis-read (nested self-closing in props, `=>` in props, imported types " +
      "in generic position) — prod incident retro-3D 'Monster 3D'.",
  },
  {
    id: "dep-completer",
    category: "validator-dep",
    risk: "risky",
    sourcePath: "src/lib/gen/autofix/dep-completer.ts",
    targetFailureMode: "Third-party deps used in code but missing from package.json",
    triggers: ["import from non-builtin without package.json entry"],
    status: "active",
    ownerPhase: "post-syntax",
  },
  {
    id: "dep-version-validator",
    category: "validator-dep",
    risk: "risky",
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
    risk: "risky",
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
    risk: "risky",
    sourcePath: "src/lib/gen/stream/finalize-version/verifier-phase.ts",
    targetFailureMode: "Verifier-blocking findings (SEO, a11y, semantics)",
    triggers: ["verifier blocking findings > 0"],
    status: "active",
    ownerPhase: "verifier",
    telemetryCounter: 'sajtmaskin_fixer_call_total{phase="verifier"}',
    notes:
      "The verifier re-runs once after this fixer pass to confirm the fix " +
      "actually addressed the finding (unconditional since 2026-04-28).",
  },
  {
    id: "llm-partial-file-repair",
    category: "llm-partial-file",
    risk: "risky",
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
    risk: "risky",
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
    risk: "safe",
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

export function getFixerRiskById(id: string): FixerRisk | undefined {
  return getFixerById(id)?.risk;
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
