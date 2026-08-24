import { describe, expect, it } from "vitest";
import {
  explainOrchestration,
  type FrozenOrchestrationView,
} from "./orchestration-explain";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function validView(
  overrides: Partial<FrozenOrchestrationView> = {},
): FrozenOrchestrationView {
  return {
    generationInputPackageHash: HASH_A,
    lineageHash: HASH_B,
    sourceReceiptHash: HASH_C,
    buildIntent: "website",
    lifecycleStage: "design",
    scaffoldId: "scaffold-landing",
    variantId: "variant-clean",
    dossierIds: ["dossier-seo", "dossier-contact"],
    sourceIds: ["src-brief", "src-theme"],
    importedRepoMode: false,
    lockedContracts: ["routes", "theme-tokens"],
    ...overrides,
  };
}

describe("explainOrchestration", () => {
  it("copies frozen fields and freezes repick flags", () => {
    const view = validView();
    const result = explainOrchestration({ view });

    expect(result).toEqual({
      ok: true,
      explanation: {
        tool: "orchestration.explain",
        canRepickScaffold: false,
        canRepickVariant: false,
        canRepickDossiers: false,
        package: {
          generationInputPackageHash: HASH_A,
          lineageHash: HASH_B,
          sourceReceiptHash: HASH_C,
        },
        selection: {
          buildIntent: "website",
          lifecycleStage: "design",
          scaffoldId: "scaffold-landing",
          variantId: "variant-clean",
          dossierIds: ["dossier-seo", "dossier-contact"],
          sourceIds: ["src-brief", "src-theme"],
          importedRepoMode: false,
        },
        lockedContracts: ["routes", "theme-tokens"],
        notes: expect.any(Array),
      },
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.explanation.canRepickScaffold).toBe(false);
    expect(result.explanation.canRepickVariant).toBe(false);
    expect(result.explanation.canRepickDossiers).toBe(false);
    expect(result.explanation.selection.dossierIds).not.toBe(view.dossierIds);
    expect(result.explanation.lockedContracts).not.toBe(view.lockedContracts);
  });

  it("sets explanation.tool to exactly orchestration.explain", () => {
    const result = explainOrchestration({ view: validView() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.explanation.tool).toBe("orchestration.explain");
  });

  it("fails on invalid hashes", () => {
    expect(
      explainOrchestration({
        view: validView({ generationInputPackageHash: "A".repeat(64) }),
      }),
    ).toEqual({ ok: false, code: "invalid_view" });
    expect(
      explainOrchestration({
        view: validView({ lineageHash: "g".repeat(64) }),
      }),
    ).toEqual({ ok: false, code: "invalid_view" });
    expect(
      explainOrchestration({
        view: validView({ sourceReceiptHash: HASH_C.slice(1) }),
      }),
    ).toEqual({ ok: false, code: "invalid_view" });
  });

  it("fails when there are too many dossiers", () => {
    const dossierIds = Array.from({ length: 33 }, (_, i) => `dossier-${i}`);
    expect(explainOrchestration({ view: validView({ dossierIds }) })).toEqual({
      ok: false,
      code: "invalid_view",
    });
  });

  it("fails on empty buildIntent", () => {
    expect(
      explainOrchestration({ view: validView({ buildIntent: "" }) }),
    ).toEqual({ ok: false, code: "invalid_view" });
  });

  it("rejects secret-like locked contracts instead of echoing them", () => {
    expect(
      explainOrchestration({
        view: validView({ lockedContracts: ["sk-live-this-must-not-echo"] }),
      }),
    ).toEqual({ ok: false, code: "invalid_view" });
    expect(
      explainOrchestration({
        view: validView({ lockedContracts: ["ghp_exampletoken"] }),
      }),
    ).toEqual({ ok: false, code: "invalid_view" });
  });

  it("does not put raw secrets or huge text in notes", () => {
    const view = Object.assign(validView(), {
      promptDump: `${"SECRET_PROMPT_BLOB ".repeat(400)}apiKey=sk-live-huge`,
      apiKey: "sk-live-abc123",
    });

    const result = explainOrchestration({ view });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const blob = JSON.stringify(result);
    expect(blob).not.toContain("sk-live");
    expect(blob).not.toContain("SECRET_PROMPT_BLOB");
    expect(blob).not.toContain("apiKey");
    const notesBlob = result.explanation.notes.join("\n");
    expect(notesBlob.length).toBeLessThan(400);
    expect(result.explanation.notes.every((note) => note.length <= 160)).toBe(
      true,
    );
    expect(notesBlob.toLowerCase()).toContain("frozen");
    expect(notesBlob.toLowerCase()).toContain("cannot change");
  });

  it("allows null scaffold and variant ids", () => {
    const result = explainOrchestration({
      view: validView({ scaffoldId: null, variantId: null }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.explanation.selection.scaffoldId).toBeNull();
    expect(result.explanation.selection.variantId).toBeNull();
  });

  it("dedupes id lists while preserving order", () => {
    const result = explainOrchestration({
      view: validView({
        dossierIds: ["seo", "contact", "seo"],
        sourceIds: ["brief", "brief", "theme"],
        lockedContracts: ["routes", "routes"],
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.explanation.selection.dossierIds).toEqual(["seo", "contact"]);
    expect(result.explanation.selection.sourceIds).toEqual(["brief", "theme"]);
    expect(result.explanation.lockedContracts).toEqual(["routes"]);
  });
});
