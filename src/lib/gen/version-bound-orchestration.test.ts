import { describe, expect, it, vi } from "vitest";

import {
  buildVersionOrchestrationFromTelemetry,
  readGenerationBaseVersionId,
  readGenerationOrchestration,
  resolveVersionBoundOrchestration,
} from "./version-bound-orchestration";

describe("version-bound orchestration", () => {
  it("uses the chat snapshot only when it belongs to the selected base", async () => {
    const readTelemetry = vi.fn();
    const result = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v2",
      latestKnownVersionId: "v2",
      chatSnapshot: { lastVersionId: "v2", briefSummary: { projectTitle: "Röd" } },
      chatScaffoldId: "landing-page",
      readTelemetry,
    });

    expect(result.source).toBe("chat-snapshot");
    expect(result.snapshot).toMatchObject({
      lastVersionId: "v2",
      briefSummary: { projectTitle: "Röd" },
    });
    expect(readTelemetry).not.toHaveBeenCalled();
  });

  it("rehydrates an explicit old version without borrowing the latest design", async () => {
    const latestResolvedDesign = { palette: "red" };
    const historicalResolvedDesign = { palette: "blue" };
    const readTelemetry = vi.fn(async () => [
      {
        scaffoldId: "landing-page",
        meta: {
          orchestrationSnapshot: {
            lastVersionId: "v1",
            scaffoldId: "landing-page",
            variantId: "editorial-lux",
            briefSummary: { projectTitle: "Blå version" },
            resolvedDesign: historicalResolvedDesign,
          },
        },
      },
    ]);
    const result = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v1",
      latestKnownVersionId: "v2",
      chatSnapshot: {
        lastVersionId: "v2",
        briefSummary: { projectTitle: "Röd version" },
        resolvedDesign: latestResolvedDesign,
      },
      chatScaffoldId: "dashboard",
      readTelemetry: readTelemetry as never,
    });

    expect(readTelemetry).toHaveBeenCalledWith("v1");
    expect(result).toMatchObject({
      source: "version-telemetry",
      scaffoldId: "landing-page",
      baseVersionId: "v1",
      snapshot: {
        lastVersionId: "v1",
        briefSummary: { projectTitle: "Blå version" },
      },
    });
    expect(result.snapshot.resolvedDesign).not.toEqual(latestResolvedDesign);
  });

  it("recovers canonical legacy telemetry fields when the envelope is absent", () => {
    const result = buildVersionOrchestrationFromTelemetry("v1", {
      scaffoldId: "landing-page",
      variantId: "warm-local",
      buildIntent: "website",
      meta: {
        briefSummary: { projectTitle: "Bageriet" },
        variantTemplateId: "bakery-template",
      },
    });

    expect(result.snapshot).toMatchObject({
      lastVersionId: "v1",
      scaffoldId: "landing-page",
      variantId: "warm-local",
      variantTemplateId: "bakery-template",
      briefSummary: { projectTitle: "Bageriet" },
      buildIntent: "website",
    });
  });

  it("fails closed to minimal historical authority when telemetry cannot be read", async () => {
    const result = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v1",
      latestKnownVersionId: "v2",
      chatSnapshot: { lastVersionId: "v2", resolvedDesign: { palette: "red" } },
      chatScaffoldId: "dashboard",
      readTelemetry: vi.fn(async () => {
        throw new Error("db unavailable");
      }) as never,
    });

    expect(result).toEqual({
      snapshot: { lastVersionId: "v1", scaffoldId: null },
      scaffoldId: null,
      source: "version-minimal",
      baseVersionId: "v1",
    });
  });

  it("keeps a legacy chat snapshot for the server-selected current base", async () => {
    const readTelemetry = vi.fn();
    const result = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v2",
      latestKnownVersionId: null,
      explicitBaseRequested: false,
      chatSnapshot: { briefSummary: { projectTitle: "Legacy brief" } },
      chatScaffoldId: "landing-page",
      readTelemetry,
    });

    expect(result).toMatchObject({
      source: "chat-snapshot",
      scaffoldId: "landing-page",
      snapshot: { briefSummary: { projectTitle: "Legacy brief" } },
    });
    expect(readTelemetry).not.toHaveBeenCalled();
  });

  it("does not borrow an unversioned snapshot for an explicit base", async () => {
    const readTelemetry = vi.fn(async () => []);
    const result = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v1",
      latestKnownVersionId: null,
      explicitBaseRequested: true,
      chatSnapshot: { briefSummary: { projectTitle: "Possibly current" } },
      chatScaffoldId: "dashboard",
      readTelemetry,
    });

    expect(readTelemetry).toHaveBeenCalledWith("v1");
    expect(result).toEqual({
      snapshot: { lastVersionId: "v1", scaffoldId: null },
      scaffoldId: null,
      source: "version-minimal",
      baseVersionId: "v1",
    });
  });

  it("reads the exact visual-review parent from the generated version", async () => {
    const readTelemetry = vi.fn(async () => [
      { meta: { orchestrationSnapshot: { baseVersionId: "v1" } } },
    ]);

    await expect(readGenerationBaseVersionId("v3", readTelemetry as never)).resolves.toBe("v1");
  });

  it("keeps the full version authority when a newer repair row only carries a verdict", async () => {
    const rows = [
      {
        scaffoldId: "landing-page",
        variantId: "editorial-lux",
        meta: { source: "server-repair-pass" },
      },
      {
        scaffoldId: "landing-page",
        variantId: "editorial-lux",
        meta: {
          orchestrationSnapshot: {
            lastVersionId: "v2",
            baseVersionId: "v1",
            scaffoldId: "landing-page",
            variantId: "editorial-lux",
            briefSummary: { projectTitle: "Repair-safe brief" },
          },
        },
      },
    ];
    const readTelemetry = vi.fn(async () => rows);

    const resolved = await resolveVersionBoundOrchestration({
      requestedBaseVersionId: "v2",
      latestKnownVersionId: "v3",
      explicitBaseRequested: true,
      chatSnapshot: { lastVersionId: "v3", briefSummary: { projectTitle: "Newest" } },
      chatScaffoldId: "dashboard",
      readTelemetry: readTelemetry as never,
    });
    expect(resolved).toMatchObject({
      source: "version-telemetry",
      scaffoldId: "landing-page",
      snapshot: {
        lastVersionId: "v2",
        baseVersionId: "v1",
        variantId: "editorial-lux",
        briefSummary: { projectTitle: "Repair-safe brief" },
      },
    });

    await expect(readGenerationOrchestration("v2", readTelemetry as never)).resolves.toMatchObject({
      source: "version-telemetry",
      snapshot: { briefSummary: { projectTitle: "Repair-safe brief" } },
    });
    await expect(readGenerationBaseVersionId("v2", readTelemetry as never)).resolves.toBe("v1");
  });

  it("does not let a sparse later snapshot shadow the complete generation row", async () => {
    const rows = [
      {
        scaffoldId: "landing-page",
        meta: {
          orchestrationSnapshot: {
            lastVersionId: "v2",
            capturedAt: "2026-08-22T16:00:00.000Z",
          },
        },
      },
      {
        scaffoldId: "landing-page",
        variantId: "editorial-lux",
        meta: {
          orchestrationSnapshot: {
            lastVersionId: "v2",
            scaffoldId: "landing-page",
            variantId: "editorial-lux",
            briefSummary: { projectTitle: "Generation brief" },
            resolvedDesign: { palette: "blue" },
          },
        },
      },
    ];
    const readTelemetry = vi.fn(async () => rows);

    await expect(readGenerationOrchestration("v2", readTelemetry as never)).resolves.toMatchObject({
      source: "version-telemetry",
      snapshot: {
        briefSummary: { projectTitle: "Generation brief" },
        variantId: "editorial-lux",
      },
    });
  });
});
