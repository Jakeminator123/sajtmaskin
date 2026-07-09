import { describe, expect, it } from "vitest";
import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";
import {
  hasBuildBreakingVerifierFindings,
  isBuildBreakingFinding,
  shouldStartOwnEnginePreview,
} from "./should-start-preview";

function previewStartContract(overrides?: Partial<PreviewStartContract>): PreviewStartContract {
  return {
    canStartPreview: true,
    primaryPreviewTarget: "preview",
    shimBlocked: false,
    requiresEnvConfig: false,
    hasCriticalInstallRisk: false,
    hasCriticalCodeFailure: false,
    compatibilityPreviewAllowed: false,
    issueCounts: {
      code_structure_failure: 0,
      dependency_install_failure: 0,
      env_config_missing: 0,
      shim_preview_failure: 0,
      non_blocking_quality_warning: 0,
    },
    blockingCategories: [],
    ...overrides,
  };
}

describe("shouldStartOwnEnginePreview", () => {
  it("is false when preview-start contract blocks startup", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: previewStartContract({ canStartPreview: false, hasCriticalCodeFailure: true }),
        parsedFileCount: 3,
      }),
    ).toBe(false);
  });

  it("is false when no files", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: previewStartContract(),
        parsedFileCount: 0,
      }),
    ).toBe(false);
  });

  it("is false when preview is not configured", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: false,
        previewStart: previewStartContract(),
        parsedFileCount: 2,
      }),
    ).toBe(false);
  });

  it("is true when configured, not blocked, and has files", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: previewStartContract(),
        parsedFileCount: 1,
      }),
    ).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────
  // SAJ-61 P0/c4: build-breaking verifier blockers gate the preview
  // ─────────────────────────────────────────────────────────────────────

  it("is false when a build-breaking verifier finding is reported", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: previewStartContract(),
        parsedFileCount: 1,
        verifierHasBuildBreakingFindings: true,
      }),
    ).toBe(false);
  });

  it("is true when only design quality findings exist (gate doesn't fire)", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: previewStartContract(),
        parsedFileCount: 1,
        verifierHasBuildBreakingFindings: false,
      }),
    ).toBe(true);
  });
});

describe("isBuildBreakingFinding", () => {
  it("classifies the canonical missing-imports finding", () => {
    expect(
      isBuildBreakingFinding({
        id: "build-breaking-missing-imports",
        detail: "components/floating-cta.tsx uses motion but does not import it",
      }),
    ).toBe(true);
  });

  it("classifies typecheck blockers from server-verify", () => {
    expect(
      isBuildBreakingFinding({
        id: "typecheck",
        detail:
          "components/home-hero.tsx(81,10): error TS2552: Cannot find name 'motion'. Did you mean 'reducedMotion'?",
      }),
    ).toBe(true);
  });

  it("classifies missing-module errors", () => {
    expect(
      isBuildBreakingFinding({
        id: "typecheck",
        detail: "src/x.ts(1,1): error TS2307: Cannot find module 'foo' or its corresponding type declarations.",
      }),
    ).toBe(true);
  });

  it("classifies bad re-exports", () => {
    expect(
      isBuildBreakingFinding({
        id: "build-error",
        detail: "Module \"./bar\": LucideIcon is not exported from lucide-react",
      }),
    ).toBe(true);
  });

  it("classifies DOM globals rendered as JSX as build-breaking", () => {
    expect(
      isBuildBreakingFinding({
        id: "undefined-jsx-symbol",
        detail:
          "app/login/page.tsx: `<HTMLFormElement />` is used but `HTMLFormElement` is neither imported nor declared in this file.",
      }),
    ).toBe(true);
  });

  it("classifies preview-blocking autofix tag mismatch warnings as build-breaking", () => {
    expect(
      isBuildBreakingFinding({
        id: "autofix-preview-blocking",
        detail:
          "[components/floating-watch-3d.tsx] preview-blocking: Tag mismatch for <Group>: 3 opening vs 0 closing",
      }),
    ).toBe(true);
  });

  it("classifies r3f-client-boundary (runtime-fatal R3F Canvas without use client)", () => {
    expect(
      isBuildBreakingFinding({
        id: "r3f-client-boundary",
        detail:
          "components/scene.tsx: React Three Fiber `<Canvas>` appears in a file without `\"use client\"`; this can pass typecheck but fail at runtime in Next App Router.",
      }),
    ).toBe(true);
  });

  // Prod incident 2026-07-09: an `import-name-collision` finding (Uint8Array
  // imported from `@/components/uint8-array` while used as the global typed
  // array) fell through the classifier and the version was promoted as
  // "verified" — /api/assistant would have crashed in prod.
  it("classifies the LLM import-name-collision finding id", () => {
    expect(
      isBuildBreakingFinding({
        id: "import-name-collision",
        detail:
          "app/api/assistant/route.ts imports Uint8Array from @/components/uint8-array but uses the global Uint8Array in new ReadableStream<Uint8Array>.",
      }),
    ).toBe(true);
  });

  it("classifies build-*-import finding ids", () => {
    expect(
      isBuildBreakingFinding({
        id: "build-invalid-import",
        detail: "app/api/chat/route.ts uses openai() with no import.",
      }),
    ).toBe(true);
    expect(
      isBuildBreakingFinding({
        id: "build-missing-import",
        detail: "no import for openai in app/api/chat/route.ts",
      }),
    ).toBe(true);
  });

  it("classifies import-collision compiler/detail phrasings", () => {
    expect(
      isBuildBreakingFinding({
        id: "typecheck",
        detail:
          "app/api/assistant/route.ts(3,8): error TS2440: Import declaration conflicts with local declaration of 'Uint8Array'.",
      }),
    ).toBe(true);
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail: "The imported name Uint8Array shadows the global typed array.",
      }),
    ).toBe(true);
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail: "openai is used in app/api/chat/route.ts but is not imported.",
      }),
    ).toBe(true);
    // Context word BEFORE the verb.
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail: "import of Uint8Array conflicts with the global typed array",
      }),
    ).toBe(true);
    // `built-in` phrasing for shadowing.
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail: "app/api/assistant/route.ts: the local import shadows the built-in Uint8Array.",
      }),
    ).toBe(true);
  });

  it("matches build-*-import ids case-insensitively (LLM ids vary casing)", () => {
    expect(
      isBuildBreakingFinding({
        id: "Build-Invalid-Import",
        detail: "app/api/chat/route.ts uses openai() with no import.",
      }),
    ).toBe(true);
    expect(
      isBuildBreakingFinding({
        id: "Import-Name-Collision",
        detail: "Uint8Array imported from @/components/uint8-array shadows the global.",
      }),
    ).toBe(true);
  });

  it("does NOT classify quality / design findings", () => {
    expect(
      isBuildBreakingFinding({
        id: "unused-import-shadowing-risk",
        detail: "components/turtle-game.tsx imports GameStatus but also declares a local type GameStatus.",
      }),
    ).toBe(false);
  });

  it("does NOT classify the advisory navigation-placeholder-actions finding", () => {
    expect(
      isBuildBreakingFinding({
        id: "navigation-placeholder-actions",
        detail: "src/app/page.tsx: hero CTA href is empty",
      }),
    ).toBe(false);
  });

  it("does NOT misclassify CSS box-shadow design findings as import shadowing", () => {
    expect(
      isBuildBreakingFinding({
        id: "design-quality",
        detail: "The card shadows are too subtle and blend into the background.",
      }),
    ).toBe(false);
  });

  it("does NOT misclassify design copy that says 'conflicts with' without name-resolution context", () => {
    expect(
      isBuildBreakingFinding({
        id: "design-quality",
        detail: "app/page.tsx: the hero conflicts with the footer rhythm.",
      }),
    ).toBe(false);
  });

  // Bugbot on #481: `global` as a layout ADJECTIVE (pre-anchor) or a bare
  // design noun (post-anchor) must not trip the build-breaking classifier.
  it("does NOT misclassify layout copy where 'global' is an adjective", () => {
    expect(
      isBuildBreakingFinding({
        id: "design-quality",
        detail: "app/page.tsx: global spacing conflicts with the mobile grid.",
      }),
    ).toBe(false);
    expect(
      isBuildBreakingFinding({
        id: "design-quality",
        detail: "the sticky header conflicts with the global nav.",
      }),
    ).toBe(false);
  });

  it("does NOT misclassify unanchored 'collides with' design copy", () => {
    expect(
      isBuildBreakingFinding({
        id: "design-quality",
        detail: "the CTA color collides with the background overlay.",
      }),
    ).toBe(false);
  });

  it("classifies anchored collision phrasings (conflicting identifier / collides with import)", () => {
    // Exact incident phrasing (ragevent 98): "creating a conflicting
    // identifier likely to fail type checking".
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail:
          "app/api/assistant/route.ts imports Uint8Array while using the global typed array, creating a conflicting identifier likely to fail type checking.",
      }),
    ).toBe(true);
    expect(
      isBuildBreakingFinding({
        id: "verifier",
        detail: "Uint8Array collides with the imported binding in app/api/assistant/route.ts.",
      }),
    ).toBe(true);
  });

  it("does NOT classify suspicious-nonstandard findings", () => {
    expect(
      isBuildBreakingFinding({
        id: "suspicious-nonstandard-component-import",
        detail: "components/floating-cta.tsx imports AnimatePresence from @/components/animate-presence...",
      }),
    ).toBe(false);
  });
});

describe("hasBuildBreakingVerifierFindings", () => {
  it("returns false for empty/undefined input", () => {
    expect(hasBuildBreakingVerifierFindings(undefined)).toBe(false);
    expect(hasBuildBreakingVerifierFindings(null)).toBe(false);
    expect(hasBuildBreakingVerifierFindings([])).toBe(false);
  });

  it("returns true when at least one finding is build-breaking", () => {
    expect(
      hasBuildBreakingVerifierFindings([
        { id: "design-quality", detail: "low contrast" },
        { id: "build-breaking-missing-imports", detail: "motion missing" },
      ]),
    ).toBe(true);
  });

  it("returns false when all findings are non-blocking", () => {
    expect(
      hasBuildBreakingVerifierFindings([
        { id: "design-quality", detail: "low contrast" },
        { id: "unused-import-shadowing-risk", detail: "shadowing" },
      ]),
    ).toBe(false);
  });
});
