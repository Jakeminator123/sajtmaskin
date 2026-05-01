import { describe, it, expect, vi } from "vitest";

// Mocka DB-klienten innan runner.ts laddas — annars kraschar modulladdningen
// med "Missing database connection string" eftersom runner.ts transitive
// importerar chat-repository-pg → db/client.ts. Den helper vi testar
// (resolveSelectedDossiersFromStreamMeta) använder INTE DB:n alls; det är
// bara import-grafens sidoeffekt vi behöver hantera.
vi.mock("@/lib/db/client", () => ({
  getDb: () => {
    throw new Error("getDb() not used in dossier-threading tests");
  },
  isBuildPhase: () => true,
}));

const { resolveSelectedDossiersFromStreamMeta } = await import("./runner");

/**
 * Regressionstest för Wave 6 verbatim-policy:
 *
 * Bevisar att `resolveSelectedDossiersFromStreamMeta` faktiskt löser fram
 * dossier-entries från orchestrationStreamMeta. Detta är pricken över i:et
 * för spår 4 (dossier hard/soft enforcement) — utan denna trådning körs
 * `applyDossierVerbatimPolicy` med tom array och verbatim-restore blir
 * de facto avstängd i produktion (vilket var review-fyndet i c538d89a0).
 */
describe("resolveSelectedDossiersFromStreamMeta — orchestration → finalize trådning", () => {
  it("returnerar tom array när capabilities saknas i streamMeta", () => {
    expect(resolveSelectedDossiersFromStreamMeta(null)).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta(undefined)).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta({})).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta({ capabilities: {} })).toEqual([]);
  });

  it("föredrar explicit selectedDossierIds från orchestration framför capability-replay", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      selectedDossierIds: ["stripe-checkout"],
      requestedCapabilities: ["visual-3d"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("stripe-checkout");
    expect(result[0]?.capability).toBe("payments");
  });

  it("faller tillbaka till requestedCapabilities om explicit dossier-id är stale", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      selectedDossierIds: ["dossier-that-does-not-exist"],
      requestedCapabilities: ["visual-3d"],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("returnerar dossier entries när requestedCapabilities matchar visual-3d", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["visual-3d"],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
    expect(result[0]?.class).toBe("soft");
    expect(result[0]?.codeFidelity).toBe("rewritable");
  });

  it("härleder visual-3d från capabilities.needs3D=true (legacy-format)", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      capabilities: { needs3D: true },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("läser även från briefSummary.requestedCapabilities", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      briefSummary: {
        requestedCapabilities: ["visual-3d"],
      },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("mergar top-level och briefSummary capabilities för legacy-replay", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["visual-3d"],
      briefSummary: {
        requestedCapabilities: ["payments"],
      },
    });
    const ids = result.map((entry) => entry.id);
    expect(ids).toContain("three-fiber-canvas");
    expect(ids).toContain("stripe-checkout");
  });

  it("ignorerar tomma/whitespace strings i requestedCapabilities", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["", "   ", "visual-3d", ""],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("returnerar tom array för okänd capability", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["nonexistent-capability-xyz"],
    });
    expect(result).toEqual([]);
  });
});
