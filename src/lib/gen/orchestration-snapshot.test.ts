import { describe, expect, it } from "vitest";
import {
  buildFollowUpBriefFromSnapshot,
  extractBriefSummaryFromSnapshot,
  mergePersistedOrchestrationSnapshots,
  prependOrchestrationContinuityToFollowUp,
  sanitizeOrchestrationSnapshotForStorage,
} from "./orchestration-snapshot";

describe("sanitizeOrchestrationSnapshotForStorage", () => {
  it("drops sensitive key names", () => {
    const out = sanitizeOrchestrationSnapshotForStorage({
      modelTier: "max",
      api_secret: "x",
      nested: { refreshToken: "bad" },
    });
    expect(out.modelTier).toBe("max");
    expect(out.api_secret).toBeUndefined();
    expect((out.nested as Record<string, unknown>)?.refreshToken).toBeUndefined();
  });

  it("truncates oversized string values", () => {
    const long = "a".repeat(13_000);
    const out = sanitizeOrchestrationSnapshotForStorage({ note: long });
    const note = out.note as string;
    expect(note.endsWith("…")).toBe(true);
    expect(note.length).toBe(12_001);
  });
});

describe("mergePersistedOrchestrationSnapshots", () => {
  it("overlays next onto previous", () => {
    const out = mergePersistedOrchestrationSnapshots(
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    );
    expect(out).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("treats null previous as empty base", () => {
    const out = mergePersistedOrchestrationSnapshots(null, { x: "y" });
    expect(out).toEqual({ x: "y" });
  });

  it("rejects stale snapshot when previous.capturedAt is newer", () => {
    const previous = { a: 1, capturedAt: "2026-04-20T12:00:00Z" };
    const staleNext = { a: 99, capturedAt: "2026-04-20T11:00:00Z" };
    const out = mergePersistedOrchestrationSnapshots(previous, staleNext);
    expect(out.a).toBe(1);
  });

  it("accepts newer snapshot when next.capturedAt is later", () => {
    const previous = { a: 1, capturedAt: "2026-04-20T11:00:00Z" };
    const newerNext = { a: 99, capturedAt: "2026-04-20T12:00:00Z" };
    const out = mergePersistedOrchestrationSnapshots(previous, newerNext);
    expect(out.a).toBe(99);
  });

  it("deep-merges buildSpec so partial next preserves keys from previous", () => {
    const out = mergePersistedOrchestrationSnapshots(
      {
        modelTier: "max",
        buildSpec: {
          changeScope: "local-layout",
          contextPolicy: "light",
          previewPolicy: "fidelity2",
        },
      },
      {
        buildSpec: {
          changeScope: "global",
        },
      },
    );
    expect(out.modelTier).toBe("max");
    expect(out.buildSpec).toEqual({
      changeScope: "global",
      contextPolicy: "light",
      previewPolicy: "fidelity2",
    });
  });
});

describe("MCP generation path snapshot (K-019 continuity)", () => {
  it("produces a usable snapshot from the MCP-style orchestrationStreamMeta", () => {
    const mcpStreamMeta = {
      modelId: "gpt-5.4",
      modelTier: "max",
      enginePath: "own-engine",
      thinking: true,
      imageGenerations: true,
      scaffoldId: "scaffold_landing",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: "landing-page",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
      },
    };

    const sanitized = sanitizeOrchestrationSnapshotForStorage(mcpStreamMeta);
    expect(sanitized.modelTier).toBe("max");
    expect(sanitized.scaffoldId).toBe("scaffold_landing");
    expect((sanitized.buildSpec as Record<string, unknown>)?.previewPolicy).toBe("fidelity2");
    expect((sanitized.buildSpec as Record<string, unknown>)?.contextPolicy).toBe("normal");
  });

  it("follow-up prepend works with a snapshot built from MCP meta", () => {
    const mcpStreamMeta = {
      modelId: "gpt-5.4",
      modelTier: "pro",
      enginePath: "own-engine",
      thinking: true,
      imageGenerations: false,
      scaffoldId: "scaffold_blog",
      buildSpec: {
        generationMode: "init",
        changeScope: "redesign",
        contextPolicy: "normal",
        previewPolicy: "fidelity2",
      },
    };

    const snapshot = {
      ...sanitizeOrchestrationSnapshotForStorage(mcpStreamMeta),
      lastVersionId: "ver_mcp_1",
      buildIntent: "website",
    };

    const prepended = prependOrchestrationContinuityToFollowUp(
      "Ändra hero-bilden till en video.",
      snapshot,
    );

    expect(prepended).toContain("## Continuity (from previous generation)");
    expect(prepended).toContain("pro");
    expect(prepended).toContain("scaffold_blog");
    expect(prepended).toContain("ver_mcp_1");
    expect(prepended).toContain("normal");
    expect(prepended).toContain("fidelity2");
    expect(prepended).toContain("Ändra hero-bilden till en video.");
  });

  it("merged snapshot preserves MCP buildSpec when builder follow-up sends partial update", () => {
    const mcpSnapshot = {
      modelTier: "pro",
      scaffoldId: "scaffold_blog",
      buildSpec: {
        generationMode: "init",
        changeScope: "redesign",
        contextPolicy: "normal",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        qualityTarget: "standard",
        scaffoldId: "blog",
      },
      lastVersionId: "ver_mcp_1",
    };

    const builderFollowUpSnap = {
      modelTier: "max",
      buildSpec: {
        generationMode: "followUp",
        changeScope: "local-layout",
        contextPolicy: "light",
      },
      lastVersionId: "ver_followup_2",
    };

    const merged = mergePersistedOrchestrationSnapshots(mcpSnapshot, builderFollowUpSnap);

    expect(merged.modelTier).toBe("max");
    expect(merged.lastVersionId).toBe("ver_followup_2");
    expect(merged.scaffoldId).toBe("scaffold_blog");

    const bs = merged.buildSpec as Record<string, unknown>;
    expect(bs.generationMode).toBe("followUp");
    expect(bs.changeScope).toBe("local-layout");
    expect(bs.contextPolicy).toBe("light");
    expect(bs.previewPolicy).toBe("fidelity2");
    expect(bs.verificationPolicy).toBe("standard");
    expect(bs.scaffoldId).toBe("blog");
  });
});

describe("prependOrchestrationContinuityToFollowUp", () => {
  it("prepends when snapshot has signals including stylePack", () => {
    const next = prependOrchestrationContinuityToFollowUp("Change the hero", {
      modelTier: "max",
      promptStrategy: "compress",
      scaffoldId: "sc_1",
      buildIntent: "landing_page",
      lastVersionId: "ver_9",
      buildSpec: {
        changeScope: "local-layout",
        contextPolicy: "light",
        previewPolicy: "fidelity2",
        stylePack: "futuristic",
      },
    });
    expect(next).toContain("Continuity");
    expect(next).toContain("max");
    expect(next).toContain("landing_page");
    expect(next).toContain("local-layout");
    expect(next).toContain("light");
    expect(next).toContain("futuristic");
    expect(next).toContain("Change the hero");
  });

  it("returns message unchanged when snapshot empty", () => {
    expect(prependOrchestrationContinuityToFollowUp("Hi", {})).toBe("Hi");
  });
});

describe("buildFollowUpBriefFromSnapshot (A1+A2 fix)", () => {
  it("returns null when snapshot has no briefSummary", () => {
    expect(buildFollowUpBriefFromSnapshot(null)).toBeNull();
    expect(buildFollowUpBriefFromSnapshot({})).toBeNull();
    expect(buildFollowUpBriefFromSnapshot({ modelTier: "pro" })).toBeNull();
  });

  it("returns null when briefSummary has no usable fields", () => {
    expect(
      buildFollowUpBriefFromSnapshot({ briefSummary: { primaryCTA: "Boka" } }),
    ).toBeNull();
  });

  it("hydrates requestedCapabilities + domainProfile so dossier-pick works on follow-up", () => {
    const snapshot = {
      briefSummary: {
        projectTitle: "Hotel Solskenet",
        brandName: "Solskenet AB",
        requestedCapabilities: ["payments", "auth", "booking"],
        domainProfile: { domain: "hospitality", industry: "hotel" },
        // Fält som INTE ska propageras till brief-objektet (style/tone hör till
        // continuity-blocket, inte till capability-driven dossier-pick).
        styleKeywords: ["minimal", "warm"],
      },
    };
    const brief = buildFollowUpBriefFromSnapshot(snapshot);
    expect(brief).not.toBeNull();
    expect(brief?.requestedCapabilities).toEqual(["payments", "auth", "booking"]);
    expect(brief?.domainProfile).toEqual({ domain: "hospitality", industry: "hotel" });
    expect(brief?.projectTitle).toBe("Hotel Solskenet");
    expect(brief?.brandName).toBe("Solskenet AB");
    expect(brief?.styleKeywords).toBeUndefined();
  });

  it("returns minimal brief with just requestedCapabilities when nothing else is set", () => {
    const brief = buildFollowUpBriefFromSnapshot({
      briefSummary: { requestedCapabilities: ["ai-chat"] },
    });
    expect(brief).toEqual({ requestedCapabilities: ["ai-chat"] });
  });
});

describe("extractBriefSummaryFromSnapshot — capability/domain extraction", () => {
  it("reads requestedCapabilities + domainProfile when present", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: {
        requestedCapabilities: ["payments"],
        domainProfile: { domain: "ecommerce", industry: "retail" },
      },
    });
    expect(out?.requestedCapabilities).toEqual(["payments"]);
    expect(out?.domainProfile).toEqual({ domain: "ecommerce", industry: "retail" });
  });

  it("treats requestedCapabilities-only briefSummary as has-content", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: { requestedCapabilities: ["auth"] },
    });
    expect(out).not.toBeNull();
    expect(out?.requestedCapabilities).toEqual(["auth"]);
  });

  it("treats domainProfile-only briefSummary as has-content (regression: was null)", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: { domainProfile: { domain: "hospitality", industry: "hotel" } },
    });
    expect(out).not.toBeNull();
    expect(out?.domainProfile).toEqual({ domain: "hospitality", industry: "hotel" });
  });

  it("ignores empty domainProfile object", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: { projectTitle: "X", domainProfile: {} },
    });
    expect(out?.domainProfile).toBeUndefined();
  });
});
