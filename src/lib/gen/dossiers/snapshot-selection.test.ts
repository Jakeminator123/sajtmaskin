import { describe, expect, it } from "vitest";
import { resolveSelectedDossiersFromSnapshot } from "./snapshot-selection";

describe("resolveSelectedDossiersFromSnapshot", () => {
  it("returns [] when snapshot is null/undefined", () => {
    expect(resolveSelectedDossiersFromSnapshot(null)).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot(undefined)).toEqual([]);
  });

  it("returns [] when snapshot is a non-object (defensive against bad DB rows)", () => {
    expect(resolveSelectedDossiersFromSnapshot("a string")).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot(42)).toEqual([]);
  });

  it("returns [] when briefSummary is missing", () => {
    expect(resolveSelectedDossiersFromSnapshot({})).toEqual([]);
    expect(resolveSelectedDossiersFromSnapshot({ briefSummary: null })).toEqual([]);
  });

  it("returns [] when requestedCapabilities is missing or empty", () => {
    expect(resolveSelectedDossiersFromSnapshot({ briefSummary: {} })).toEqual([]);
    expect(
      resolveSelectedDossiersFromSnapshot({ briefSummary: { requestedCapabilities: [] } }),
    ).toEqual([]);
    expect(
      resolveSelectedDossiersFromSnapshot({
        briefSummary: { requestedCapabilities: "not-an-array" },
      }),
    ).toEqual([]);
  });

  it("filters non-string capability entries", () => {
    expect(
      resolveSelectedDossiersFromSnapshot({
        briefSummary: { requestedCapabilities: [42, null, "", undefined] },
      }),
    ).toEqual([]);
  });

  it("resolves a known capability into a SelectedDossier (analytics → vercel-analytics)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      briefSummary: { requestedCapabilities: ["analytics"] },
    });
    expect(result.length).toBeGreaterThan(0);
    const ids = result.map((d) => d.entry.id);
    // Either vercel-analytics (default) or plausible-analytics depending on
    // tie-break; both are valid analytics dossiers.
    expect(ids.some((id) => id.includes("analytics"))).toBe(true);
  });

  it("resolves multiple capabilities into one SelectedDossier each (mostly)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      briefSummary: { requestedCapabilities: ["payments", "contact-form"] },
    });
    const capabilities = result.map((d) => d.entry.capability);
    expect(capabilities).toContain("payments");
    expect(capabilities).toContain("contact-form");
  });

  it("returns [] for an unknown capability (no match in registry)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      briefSummary: { requestedCapabilities: ["this-capability-does-not-exist"] },
    });
    expect(result).toEqual([]);
  });

  // BUG-SWARM rank 3 regression: the persisted orchestration_snapshot stores
  // capabilities under `briefSummary` (see `own-engine-build-session.ts` ->
  // `extractBriefSummary`). The resolver used to read `snapshot.brief`, which the
  // persisted shape never carries, so this realistic row used to resolve to [].
  it("resolves dossiers from the real persisted snapshot shape (briefSummary)", () => {
    const persistedSnapshot = {
      lastVersionId: "v-123",
      lastChatId: "chat-123",
      capturedAt: "2026-06-21T10:00:00.000Z",
      briefSummary: {
        projectTitle: "Acme",
        requestedCapabilities: ["analytics"],
      },
    };
    const result = resolveSelectedDossiersFromSnapshot(persistedSnapshot);
    expect(result.length).toBeGreaterThan(0);
  });

  it("still reads a legacy already-rehydrated `brief` shape (back-compat)", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      brief: { requestedCapabilities: ["analytics"] },
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it("reads a top-level requestedCapabilities field defensively", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      requestedCapabilities: ["analytics"],
    });
    expect(result.length).toBeGreaterThan(0);
  });

  // BUG-SWARM rank 3 follow-up (Bugbot): the persisted snapshot carries BOTH a
  // top-level `requestedCapabilities` (the merged floor that drove generation —
  // brief + inferred-bridge + follow-up floor) and a `briefSummary` subset. The
  // resolver must prefer the richer top-level set; reading the briefSummary
  // subset would drop bridge/floor capabilities and misclassify their env keys.
  it("prefers the top-level merged floor over the briefSummary subset", () => {
    const result = resolveSelectedDossiersFromSnapshot({
      requestedCapabilities: ["analytics", "payments"],
      briefSummary: { requestedCapabilities: ["analytics"] },
    });
    const capabilities = result.map((d) => d.entry.capability);
    expect(capabilities).toContain("analytics");
    expect(capabilities).toContain("payments");
  });
});
