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

  it("does NOT classify quality / design findings", () => {
    expect(
      isBuildBreakingFinding({
        id: "unused-import-shadowing-risk",
        detail: "components/turtle-game.tsx imports GameStatus but also declares a local type GameStatus.",
      }),
    ).toBe(false);
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
