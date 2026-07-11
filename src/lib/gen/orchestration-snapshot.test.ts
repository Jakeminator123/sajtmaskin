import { describe, expect, it } from "vitest";
import {
  buildFollowUpBriefFromSnapshot,
  buildFollowUpContract,
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

  it("lets an explicit removal overwrite stale F3 approvals with empty arrays", () => {
    const out = mergePersistedOrchestrationSnapshots(
      {
        f3ApprovedCapabilities: ["payments"],
        f3ApprovedProviders: ["stripe"],
      },
      {
        requestedCapabilities: [],
        f3ApprovedCapabilities: [],
        f3ApprovedProviders: [],
        removedCapabilities: ["payments"],
      },
    );

    expect(out.f3ApprovedCapabilities).toEqual([]);
    expect(out.f3ApprovedProviders).toEqual([]);
    expect(out.requestedCapabilities).toEqual([]);
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

  it("keeps the removal tombstone durable when a later neutral round carries an empty list", () => {
    // Round after a removal that emptied the floor.
    const afterRemoval = mergePersistedOrchestrationSnapshots(
      { requestedCapabilities: ["payments"] },
      { requestedCapabilities: [], removedCapabilities: ["payments"] },
    );
    expect(afterRemoval.removedCapabilities).toEqual(["payments"]);
    // Neutral follow-up: round-scoped removal recomputes to [] — must NOT wipe.
    const afterNeutral = mergePersistedOrchestrationSnapshots(afterRemoval, {
      requestedCapabilities: [],
      removedCapabilities: [],
    });
    expect(afterNeutral.removedCapabilities).toEqual(["payments"]);
  });

  it("clears the tombstone for a capability the current round re-adds to the floor", () => {
    const afterRemoval = {
      requestedCapabilities: [],
      removedCapabilities: ["payments"],
    };
    const afterReadd = mergePersistedOrchestrationSnapshots(afterRemoval, {
      requestedCapabilities: ["payments"],
      removedCapabilities: [],
    });
    expect(afterReadd.removedCapabilities).toEqual([]);
    expect(afterReadd.requestedCapabilities).toEqual(["payments"]);
  });

  it("does not add a removedCapabilities key to snapshots that never removed anything", () => {
    const out = mergePersistedOrchestrationSnapshots({ a: 1 }, { b: 2 });
    expect("removedCapabilities" in out).toBe(false);
  });
});

describe("capability-removal durability (resurrection regression)", () => {
  // Full persisted round-trip: the exact "Stripe-only site" repro that
  // resurrected before the durable tombstone. Uses the real merge +
  // buildFollowUpContract, mirroring how finalize persists and how the next
  // round reads the floor.
  const capsOf = (snapshot: Record<string, unknown>) =>
    buildFollowUpContract({
      snapshot,
      persistedScaffoldId: null,
      persistedVariantId: null,
      existingRoutePaths: [],
      existingShellRoutePaths: [],
      priorQualityTarget: null,
    }).capabilities;

  it("keeps an emptied-floor removal gone across a neutral follow-up, and restores on re-add", () => {
    const init = {
      requestedCapabilities: ["payments"],
      briefSummary: { requestedCapabilities: ["payments"] },
      capturedAt: "2026-07-11T10:00:00Z",
    };
    // "ta bort Stripe" — floor empties, tombstone set.
    const round1 = mergePersistedOrchestrationSnapshots(init, {
      requestedCapabilities: [],
      removedCapabilities: ["payments"],
      capturedAt: "2026-07-11T10:05:00Z",
    });
    expect(capsOf(round1)).toEqual([]);
    // "gör rubriken större" — neutral; must stay removed (was resurrection).
    const round2 = mergePersistedOrchestrationSnapshots(round1, {
      requestedCapabilities: [],
      removedCapabilities: [],
      capturedAt: "2026-07-11T10:10:00Z",
    });
    expect(capsOf(round2)).toEqual([]);
    // Second neutral round — still gone.
    const round3 = mergePersistedOrchestrationSnapshots(round2, {
      requestedCapabilities: [],
      removedCapabilities: [],
      capturedAt: "2026-07-11T10:15:00Z",
    });
    expect(capsOf(round3)).toEqual([]);
    // "lägg tillbaka Stripe" — floor re-adds payments; tombstone clears.
    const round4 = mergePersistedOrchestrationSnapshots(round3, {
      requestedCapabilities: ["payments"],
      removedCapabilities: [],
      capturedAt: "2026-07-11T10:20:00Z",
    });
    expect(capsOf(round4)).toEqual(["payments"]);
  });

  it("still inherits brief capabilities for an ordinary F2 snapshot that never removed anything", () => {
    // No removal signal ever → F2 top-level mute must still inherit from brief.
    const f2 = mergePersistedOrchestrationSnapshots(
      {
        requestedCapabilities: ["payments"],
        briefSummary: { requestedCapabilities: ["payments"] },
      },
      { requestedCapabilities: [], capturedAt: "2026-07-11T10:05:00Z" },
    );
    expect(capsOf(f2)).toEqual(["payments"]);
  });

  it("does not over-suppress retained capabilities after a partial removal", () => {
    const init = {
      requestedCapabilities: ["payments", "auth"],
      briefSummary: { requestedCapabilities: ["payments", "auth"] },
      capturedAt: "2026-07-11T10:00:00Z",
    };
    const round1 = mergePersistedOrchestrationSnapshots(init, {
      requestedCapabilities: ["auth"],
      removedCapabilities: ["payments"],
      capturedAt: "2026-07-11T10:05:00Z",
    });
    expect(capsOf(round1)).toEqual(["auth"]);
    const round2 = mergePersistedOrchestrationSnapshots(round1, {
      requestedCapabilities: ["auth"],
      removedCapabilities: [],
      capturedAt: "2026-07-11T10:10:00Z",
    });
    expect(capsOf(round2)).toEqual(["auth"]);
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
      buildFollowUpBriefFromSnapshot({
        briefSummary: { colorPalette: {}, typography: {}, domainProfile: {} },
      }),
    ).toBeNull();
  });

  it("rehydrates primaryCTA + seasonalHints under consumer keys (M#818-1)", () => {
    // The snapshot persisted `primaryCTA` from day one but never read it back,
    // and `seasonalHints` was never persisted — follow-ups silently lost both.
    const brief = buildFollowUpBriefFromSnapshot({
      briefSummary: { primaryCTA: "Boka nu", seasonalHints: ["jul", "vinterkampanj"] },
    });
    expect(brief).toEqual({
      primaryCallToAction: "Boka nu",
      seasonalHints: ["jul", "vinterkampanj"],
    });
  });

  it("hydrates requestedCapabilities + domainProfile so dossier-pick works on follow-up", () => {
    const snapshot = {
      briefSummary: {
        projectTitle: "Hotel Solskenet",
        brandName: "Solskenet AB",
        requestedCapabilities: ["payments", "auth", "booking"],
        domainProfile: { domain: "hospitality", industry: "hotel" },
        // Rapport 07#3 (2026-04-22 audit): style/tone måste rehydreras under
        // de shape-nycklar consumers läser (system-prompt.ts läser
        // `brief.visualDirection.styleKeywords` + `brief.toneAndVoice`;
        // scaffold-query-context.ts samma). Continuity-prosan ersätter inte
        // strukturerade fält — utan rehydrering tappade follow-ups hela art
        // direction fast snapshot bevarade den.
        styleKeywords: ["minimal", "warm"],
        toneKeywords: ["professionell", "välkomnande"],
        qualityBar: "premium",
        motionLevel: "lively",
        colorPalette: {
          primary: "#f59e0b",
          secondary: "#7c2d12",
          accent: "#fde68a",
          background: "#fff7ed",
          text: "#1f1308",
        },
        typography: {
          headings: "serif editorial",
          body: "humanist sans",
        },
      },
    };
    const brief = buildFollowUpBriefFromSnapshot(snapshot);
    expect(brief).not.toBeNull();
    expect(brief?.requestedCapabilities).toEqual(["payments", "auth", "booking"]);
    // 2026-04-22 follow-up audit: rehydreras nu som slug-sträng eftersom
    // system-prompt + guidance-resolvers förväntar `brief.domainProfile?: string`
    // (object-formen slukades av str(...)-coercing i system-prompt).
    expect(brief?.domainProfile).toBe("hospitality");
    expect(brief?.projectTitle).toBe("Hotel Solskenet");
    expect(brief?.brandName).toBe("Solskenet AB");
    expect(brief?.visualDirection).toEqual({
      styleKeywords: ["minimal", "warm"],
      colorPalette: {
        primary: "#f59e0b",
        secondary: "#7c2d12",
        accent: "#fde68a",
        background: "#fff7ed",
        text: "#1f1308",
      },
      typography: {
        headings: "serif editorial",
        body: "humanist sans",
      },
    });
    expect(brief?.toneAndVoice).toEqual(["professionell", "välkomnande"]);
    expect(brief?.qualityBar).toBe("premium");
    expect(brief?.motionLevel).toBe("lively");
  });

  it("hydrates style/tone when nothing else is present so art direction carries on follow-up", () => {
    // Rapport 07#3: style/tone alone ska ge ett icke-tomt brief-objekt så
    // att system-prompt.ts och scaffold-query-context.ts ser designfälten
    // även när ingen capability-data finns i snapshot.
    const brief = buildFollowUpBriefFromSnapshot({
      briefSummary: { styleKeywords: ["editorial"], toneKeywords: ["confident"] },
    });
    expect(brief).toEqual({
      visualDirection: { styleKeywords: ["editorial"] },
      toneAndVoice: ["confident"],
    });
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

  it("reads design values used by Brief-Locked Design Values from snapshot", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: {
        qualityBar: "bold-dramatic",
        motionLevel: "lively",
        colorPalette: { primary: "#111111", background: "#fef3c7" },
        typography: { headings: "display serif", body: "sans" },
      },
    });
    expect(out).not.toBeNull();
    expect(out?.qualityBar).toBe("bold-dramatic");
    expect(out?.motionLevel).toBe("lively");
    expect(out?.colorPalette).toMatchObject({ primary: "#111111", background: "#fef3c7" });
    expect(out?.typography).toEqual({ headings: "display serif", body: "sans" });
  });

  it("ignores empty domainProfile object", () => {
    const out = extractBriefSummaryFromSnapshot({
      briefSummary: { projectTitle: "X", domainProfile: {} },
    });
    expect(out?.domainProfile).toBeUndefined();
  });
});
