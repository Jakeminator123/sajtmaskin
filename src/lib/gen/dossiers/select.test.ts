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

// ─────────────────────────────────────────────────────────────────────────
// Dossier wave 2 (2026-07-08): three dossiers share capability `database`
// (postgres-drizzle default, neon-postgres + mongodb-atlas siblings). An
// explicit provider ask in the prompt overrides the default via manifest
// `relevanceKeywords`; without a prompt (dep-completer backstop, snapshot
// re-selection) the default always wins.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — relevanceKeywords disambiguation (database)", () => {
  it("picks postgres-drizzle (default) for a generic database ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "en bokningssajt som sparar bokningar i en databas",
    });
    expect(result.selected[0]?.entry.id).toBe("postgres-drizzle");
    expect(result.selected[0]?.reason).toBe("capability-match");
  });

  it("picks postgres-drizzle when no prompt text is supplied", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
    });
    expect(result.selected[0]?.entry.id).toBe("postgres-drizzle");
  });

  it("picks mongodb-atlas on an explicit MongoDB ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "lagra produkterna i MongoDB Atlas",
    });
    expect(result.selected[0]?.entry.id).toBe("mongodb-atlas");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("picks neon-postgres on an explicit DB-flavoured Neon ask (neon.tech)", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "hosta medlemsregistret på neon.tech",
    });
    expect(result.selected[0]?.entry.id).toBe("neon-postgres");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("does NOT pick neon-postgres for a bare design-word 'neon' ask", () => {
    // Codex P2 (#445): bare "neon" is a style/brand noun (neon sign, neon
    // café, neon colours). Only DB-flavoured Neon phrases ("neon postgres",
    // "neon.tech", …) should override the default — a generic database for a
    // neon-themed shop must stay on postgres-drizzle.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "en databas till mitt neon cafe",
    });
    expect(result.selected[0]?.entry.id).toBe("postgres-drizzle");
  });

  it("picks mongodb-atlas even when a competing provider is negated", () => {
    // Codex P1 (#445): "mongodb ... inte postgres" must not let the negated
    // "postgres" pull selection to the default. Because the default carries no
    // relevanceKeywords, only the positive mongo intent matches.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "lägg till mongodb för ordrarna, inte postgres",
    });
    expect(result.selected[0]?.entry.id).toBe("mongodb-atlas");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("picks mongodb-atlas for 'mongodb utan drizzle'", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "vi vill ha mongodb utan drizzle för produktdatan",
    });
    expect(result.selected[0]?.entry.id).toBe("mongodb-atlas");
  });

  it("matches hyphenated provider forms of multi-word keywords (mongodb-atlas)", () => {
    // Codex P2 (#445): the follow-up vocabulary accepts hyphenated provider
    // forms ("mongodb-atlas", "neon-postgres"); the relevance matcher must
    // treat spaces in multi-word keywords as space-or-hyphen so those prompts
    // reach the intended sibling instead of the postgres-drizzle default.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "sätt upp mongodb-atlas för kunddatan",
    });
    expect(result.selected[0]?.entry.id).toBe("mongodb-atlas");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("matches hyphenated neon-postgres and neon-db forms", () => {
    const hyphenPostgres = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "kör neon-postgres för medlemsdatan",
    });
    expect(hyphenPostgres.selected[0]?.entry.id).toBe("neon-postgres");

    const hyphenDb = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "spara allt i en neon-db",
    });
    expect(hyphenDb.selected[0]?.entry.id).toBe("neon-postgres");
  });

  it("picks neon-postgres across a preposition ('use Neon for the database')", () => {
    // Codex P2 (#445): DB-flavoured Neon intent with a connector between the
    // provider and the database noun must still reach the sibling.
    const en = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "use Neon for the database",
    });
    expect(en.selected[0]?.entry.id).toBe("neon-postgres");

    const sv = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "använd Neon för databasen",
    });
    expect(sv.selected[0]?.entry.id).toBe("neon-postgres");
  });

  it("picks neon-postgres on the natural 'Neon Postgres' phrasing", () => {
    // The default postgres-drizzle deliberately carries NO relevanceKeywords
    // (it is the fallback), so the "postgres" in "Neon Postgres" must not pull
    // selection back to the Drizzle default — the explicit Neon provider intent
    // wins. Guards against the sibling-vs-default tie-break regressing.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "vi vill ha Neon Postgres som databas för medlemmarna",
    });
    expect(result.selected[0]?.entry.id).toBe("neon-postgres");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("keeps the default for a bare 'postgres'/'drizzle' ask (default needs no keyword)", () => {
    // A generic Postgres/Drizzle ask has no sibling keyword to override the
    // default, so postgres-drizzle wins as the capability default — reason is
    // capability-match, not relevance-keyword.
    const drizzle = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "spara beställningarna i postgres med drizzle",
    });
    expect(drizzle.selected[0]?.entry.id).toBe("postgres-drizzle");
    expect(drizzle.selected[0]?.reason).toBe("capability-match");
  });

  it("does NOT let a hyphen compound hit a bare keyword (neon-skylt ≠ Neon)", () => {
    // "neon-skylt" (neon sign) is a design noun, not a database provider ask.
    // The keyword matcher treats hyphen as part of the word, so the default
    // still wins.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "en databas för min butik med neon-skyltar",
    });
    expect(result.selected[0]?.entry.id).toBe("postgres-drizzle");
  });

  it("keyword override is scoped to the shared capability — other selections untouched", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments", "database"],
      promptText: "checkout med stripe och spara ordrar i mongodb",
    });
    const byId = new Map(result.selected.map((s) => [s.entry.capability, s.entry.id]));
    expect(byId.get("payments")).toBe("stripe-checkout");
    expect(byId.get("database")).toBe("mongodb-atlas");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// fix-isconfigured (wave 1): the `configured` flag must reflect the PROJECT'S
// stored env keys, not the platform `process.env`. Callers pass
// `configuredEnvKeys`; when omitted, the legacy process.env fallback stays.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — configuredEnvKeys (project-scoped)", () => {
  it("marks a hard dossier configured from the project env key set", () => {
    // Platform env is empty; the PROJECT set carries the keys → configured.
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
      configuredEnvKeys: new Set([
        "STRIPE_SECRET_KEY",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      ]),
    });
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("ignores platform process.env when configuredEnvKeys is supplied", () => {
    // The platform has the keys, but the PROJECT set does not → unconfigured.
    // This is the exact leak `configuredEnvKeys` fixes.
    process.env.STRIPE_SECRET_KEY = "sk_platform_leak";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_platform_leak";
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
      configuredEnvKeys: new Set<string>(),
    });
    expect(result.selected[0]?.configured).toBe(false);
  });

  it("keeps soft dossiers configured regardless of configuredEnvKeys", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["pricing-section"],
      configuredEnvKeys: new Set<string>(),
    });
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("falls back to process.env when configuredEnvKeys is omitted (legacy)", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_xxx";
    const result = selectDossiersForRequest({ requestedCapabilities: ["payments"] });
    expect(result.selected[0]?.configured).toBe(true);
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
