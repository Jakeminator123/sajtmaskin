import { describe, expect, it } from "vitest";

import type { PlanDesignAuthority } from "./design-authority";
import {
  parsePlanDesignAuthority,
  PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY,
  resolveApprovedPlanDesignAuthority,
} from "./design-authority";

function authority(
  lineageHash = "lineage-a",
  base: { versionId: string | null; filesRevision: string | null } = {
    versionId: "v1",
    filesRevision: "rev-v1",
  },
): PlanDesignAuthority {
  return {
    schemaVersion: 2,
    baseVersionId: base.versionId,
    baseFilesRevision: base.filesRevision,
    requestAttachments: [],
    customInstructions: null,
    imageGenerations: true,
    scaffoldId: "landing-page",
    buildIntent: "website",
    variantId: null,
    variantSelection: {
      source: "hash-fallback",
      score: null,
      runnerUpScore: null,
      margin: null,
      hintId: null,
      finalId: null,
      changedFromHint: false,
    },
    resolvedDesign: {
      schemaVersion: 1,
      variantId: null,
      explicitAxes: [],
      explicitFields: [],
      styleKeywords: { value: [], source: "default", locked: false },
      toneAndVoice: { value: [], source: "default", locked: false },
      colorMode: { value: null, source: "default", locked: false },
      themeTokens: {},
      typography: {
        heading: { value: null, source: "default", locked: false },
        body: { value: null, source: "default", locked: false },
      },
      motionLevel: { value: null, source: "default", locked: false },
      qualityBar: { value: null, source: "default", locked: false },
      domainProfile: { value: null, source: "default", locked: false },
    },
    variantTemplateId: null,
    brief: null,
    lineageHash,
  };
}

describe("resolveApprovedPlanDesignAuthority", () => {
  it("does not engage for ordinary prompts", () => {
    expect(
      resolveApprovedPlanDesignAuthority({
        promptSourceKind: "inline",
        requestedLineageHash: null,
        currentBaseVersionId: null,
        currentBaseFilesRevision: null,
        snapshot: null,
      }),
    ).toEqual({ ok: true, authority: null });
  });

  it("fails closed when the server-owned authority is missing or stale", () => {
    expect(
      resolveApprovedPlanDesignAuthority({
        promptSourceKind: "approved-plan",
        requestedLineageHash: "lineage-a",
        currentBaseVersionId: "v1",
        currentBaseFilesRevision: "rev-v1",
        snapshot: null,
      }),
    ).toEqual({ ok: false, error: "plan_design_authority_missing" });

    expect(
      resolveApprovedPlanDesignAuthority({
        promptSourceKind: "approved-plan",
        requestedLineageHash: "lineage-a",
        currentBaseVersionId: "v1",
        currentBaseFilesRevision: "rev-v1",
        snapshot: { [PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY]: authority("lineage-b") },
      }),
    ).toEqual({ ok: false, error: "plan_design_authority_stale" });
  });

  it("accepts the exact lineage for plans on both new and existing sites", () => {
    const pending = authority();
    const result = resolveApprovedPlanDesignAuthority({
      promptSourceKind: "approved-plan",
      requestedLineageHash: "lineage-a",
      currentBaseVersionId: "v1",
      currentBaseFilesRevision: "rev-v1",
      snapshot: { [PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY]: pending },
    });

    expect(result).toEqual({ ok: true, authority: pending });
  });

  it("rejects a historical plan when the active version or its files changed", () => {
    const pending = authority("lineage-a", { versionId: "v1", filesRevision: "rev-v1" });

    for (const current of [
      { currentBaseVersionId: "v3", currentBaseFilesRevision: "rev-v3" },
      { currentBaseVersionId: "v1", currentBaseFilesRevision: "rev-v1-repaired" },
    ]) {
      expect(
        resolveApprovedPlanDesignAuthority({
          promptSourceKind: "approved-plan",
          requestedLineageHash: "lineage-a",
          ...current,
          snapshot: { [PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY]: pending },
        }),
      ).toEqual({ ok: false, error: "plan_design_authority_base_stale" });
    }
  });

  it("accepts a versionless init plan only for a versionless build", () => {
    const pending = authority("lineage-init", { versionId: null, filesRevision: null });
    expect(
      resolveApprovedPlanDesignAuthority({
        promptSourceKind: "approved-plan",
        requestedLineageHash: "lineage-init",
        currentBaseVersionId: null,
        currentBaseFilesRevision: null,
        snapshot: { [PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY]: pending },
      }),
    ).toEqual({ ok: true, authority: pending });
  });

  it("fails closed for legacy authorities that do not bind scaffold/build intent", () => {
    const { scaffoldId: _scaffoldId, ...withoutScaffold } = authority();
    const { buildIntent: _buildIntent, ...withoutIntent } = authority();
    const { baseFilesRevision: _baseFilesRevision, ...withoutRevision } = authority();
    const { requestAttachments: _requestAttachments, ...withoutAttachments } = authority();

    expect(parsePlanDesignAuthority(withoutScaffold)).toBeNull();
    expect(parsePlanDesignAuthority(withoutIntent)).toBeNull();
    expect(parsePlanDesignAuthority(withoutRevision)).toBeNull();
    expect(parsePlanDesignAuthority(withoutAttachments)).toBeNull();
  });
});
