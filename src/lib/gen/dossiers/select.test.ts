/**
 * Tests for the new deterministic, capability-driven dossier selection.
 * No mocked filesystem — these run against the real data/dossiers/ pool.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDossierRegistryCache, getAllDossiers } from "./registry";
import { selectDossiersForRequest } from "./select";

const ENV_BACKUP = { ...process.env };

beforeEach(() => {
  clearDossierRegistryCache();
});

afterEach(() => {
  process.env = { ...ENV_BACKUP };
  vi.restoreAllMocks();
});

describe("selectDossiersForRequest (deterministic capability-driven)", () => {
  it("returns empty selection when no capabilities are requested", () => {
    const result = selectDossiersForRequest({});
    expect(result.selected).toEqual([]);
    expect(result.byCapability).toEqual({});
    expect(result.poolSize).toBeGreaterThan(0);
  });

  it("picks the matching dossier for a single capability", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.capability).toBe("payments");
    expect(result.byCapability["payments"]?.length).toBe(1);
  });

  it("respects defaultForCapability when multiple match", () => {
    // The seed pool ships with stripe-checkout marked as default for payments.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    expect(result.selected[0]?.entry.id).toBe("stripe-checkout");
    expect(result.selected[0]?.reason).toBe("capability-match");
  });

  it("marks hard dossier as unconfigured when env var is missing", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    expect(result.selected[0]?.configured).toBe(false);
  });

  it("marks hard dossier as configured when all required env vars are set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_xxx";
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("marks soft dossier as configured (no env vars)", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["pricing-section"],
    });
    expect(result.selected[0]?.entry.class).toBe("soft");
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("reads requestedCapabilities from brief object as fallback", () => {
    const result = selectDossiersForRequest({
      brief: { requestedCapabilities: ["pricing-section"] },
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("pricing-tier-table");
  });

  it("explicit option overrides brief", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
      brief: { requestedCapabilities: ["pricing-section"] },
    });
    expect(result.selected.map((s) => s.entry.capability)).toEqual(["payments"]);
  });

  it("silently skips capabilities with no matching dossier", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments", "no-such-capability"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.capability).toBe("payments");
  });

  it("eagerly loads instructions for selected dossiers", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["pricing-section"],
    });
    const instructions = result.selected[0]?.entry.instructions ?? "";
    expect(instructions).toContain("# When to use");
  });

  it("normalizes capabilities to lowercase + dedup", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["PAYMENTS", "payments", " payments "],
    });
    expect(result.selected).toHaveLength(1);
  });

  it("picks interactive-game-loop for an interactive-game capability", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["interactive-game"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("interactive-game-loop");
    expect(result.selected[0]?.entry.capability).toBe("interactive-game");
    expect(result.selected[0]?.entry.class).toBe("soft");
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("eagerly loads the six-point contract instructions for interactive-game-loop", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["interactive-game"],
    });
    const instructions = result.selected[0]?.entry.instructions ?? "";
    expect(instructions).toContain("# When to use");
    expect(instructions).toContain("# How to integrate");
    // The six non-negotiables must all be named in instructions so the
    // codegen LLM sees the mental model in the dossier block.
    expect(instructions).toContain("State");
    expect(instructions).toContain("Loop");
    expect(instructions).toContain("Controls");
    expect(instructions).toContain("Collision");
    expect(instructions).toContain("Score");
    expect(instructions).toContain("restart");
  });

  it("selects game + 3D together for an explicitly-3D game prompt", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["visual-3d", "interactive-game"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("three-fiber-canvas");
    expect(ids).toContain("interactive-game-loop");
  });
});

describe("getAllDossiers", () => {
  it("walks both hard/ and soft/ folders", () => {
    const all = getAllDossiers();
    const classes = new Set(all.map((d) => d.class));
    expect(classes.has("hard")).toBe(true);
    expect(classes.has("soft")).toBe(true);
  });

  it("hard dossiers default to verbatim, soft to rewritable", () => {
    const all = getAllDossiers();
    const stripe = all.find((d) => d.id === "stripe-checkout");
    const pricing = all.find((d) => d.id === "pricing-tier-table");
    expect(stripe?.codeFidelity).toBe("verbatim");
    expect(pricing?.codeFidelity).toBe("rewritable");
  });
});
