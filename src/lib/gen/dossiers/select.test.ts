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

  // Bugbot on #482: a Byggblock-catalog pick sends the dossier id verbatim
  // (`Lägg till byggblocket "Plausible" (id: plausible-analytics)`). The id
  // must count as explicit sibling intent so the pick beats the capability
  // default (vercel-analytics) even when no manifest relevanceKeyword appears
  // in the label.
  it("picks an explicitly id-referenced sibling over the capability default", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["analytics"],
      promptText: 'Lägg till byggblocket "Plausible" (id: plausible-analytics)',
    });
    expect(result.selected[0]?.entry.id).toBe("plausible-analytics");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("still picks the capability default when the default's own id is referenced", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["analytics"],
      promptText: 'Lägg till byggblocket "Besöksstatistik" (id: vercel-analytics)',
    });
    expect(result.selected[0]?.entry.id).toBe("vercel-analytics");
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
      requestedCapabilities: ["gallery-lightbox"],
    });
    expect(result.selected[0]?.entry.class).toBe("soft");
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("reads requestedCapabilities from brief object as fallback", () => {
    const result = selectDossiersForRequest({
      brief: { requestedCapabilities: ["gallery-lightbox"] },
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("gallery-lightbox");
  });

  it("explicit option overrides brief", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
      brief: { requestedCapabilities: ["gallery-lightbox"] },
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
      requestedCapabilities: ["gallery-lightbox"],
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
// Dependent capabilities (Codex P1 #475, re-expressed after the 2026-07-22
// auth merge): `subscriptions` (paddle-billing) only produces a working
// feature with a signed-in Supabase user, so every selection of
// `subscriptions` must also pull `auth` PINNED to the supabase-auth dossier
// (reason "dependency-pin") — regardless of which caller path (init,
// follow-up, snapshot, dep-completer) invoked select. Exactly ONE auth
// dossier is ever selected — never two root middlewares.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — dependent capabilities", () => {
  it("co-selects the supabase-auth dossier under `auth` whenever subscriptions is requested", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("paddle-billing");
    expect(ids).toContain("supabase-auth");
    expect(result.byCapability["auth"]).toEqual(["supabase-auth"]);
    const authPick = result.selected.find((s) => s.entry.id === "supabase-auth");
    expect(authPick?.reason).toBe("dependency-pin");
    expect(authPick?.entry.capability).toBe("auth");
  });

  it("selects exactly ONE auth dossier for [subscriptions, auth] — the pin wins over the clerk default", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions", "auth"],
    });
    const authPicks = result.selected.filter((s) => s.entry.capability === "auth");
    expect(authPicks).toHaveLength(1);
    expect(authPicks[0]?.entry.id).toBe("supabase-auth");
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).not.toContain("clerk-auth");
  });

  it("does not duplicate supabase-auth when the legacy alias is requested alongside subscriptions", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions", "supabase-auth"],
    });
    const authPicks = result.selected.filter((s) => s.entry.id === "supabase-auth");
    expect(authPicks).toHaveLength(1);
  });

  it("resolves the legacy 'supabase-auth' capability alias to the pinned dossier under `auth`", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["supabase-auth"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.entry.capability).toBe("auth");
    expect(result.byCapability["auth"]).toEqual(["supabase-auth"]);
  });

  it("still picks clerk-auth (capability default) for a plain auth request", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("clerk-auth");
  });

  it("picks supabase-auth via relevance-keyword for 'logga in med supabase'", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "logga in med supabase",
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("does not pull supabase-auth for capabilities without a dependency", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).not.toContain("supabase-auth");
  });

  it("drops generic ai-chat when ai-tool-calling is present — no redundant chatbot", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["ai-tool-calling", "ai-chat"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("ai-tool-calling-chat");
    expect(ids).not.toContain("openai-chat");
  });

  it("keeps ai-chat when ai-tool-calling is NOT requested", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["ai-chat"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("openai-chat");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Taxonomy 2026-07-22: capability rename + new key-free soft dossiers.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — command-palette rename + new soft dossiers", () => {
  it("resolves the legacy 'command-search' alias to cmdk-command-palette under 'command-palette'", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["command-search"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("cmdk-command-palette");
    expect(result.selected[0]?.entry.capability).toBe("command-palette");
    expect(result.byCapability["command-palette"]).toEqual(["cmdk-command-palette"]);
  });

  it("selects maplibre-map for map-display", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["map-display"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("maplibre-map");
    expect(result.selected[0]?.entry.class).toBe("soft");
    expect(result.selected[0]?.configured).toBe(true);
  });

  it("selects local-site-search for site-search", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["site-search"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("local-site-search");
    expect(result.selected[0]?.entry.class).toBe("soft");
    expect(result.selected[0]?.configured).toBe(true);
  });
});

// F3 capability-scope follow-up (review round 2): when the caller COMPUTED the
// capability list (the scoped F3 set), an empty list means "wire nothing" —
// the brief fallback must not resurrect the speculative brief capabilities.
describe("selectDossiersForRequest — disableBriefFallback (F3 scope)", () => {
  const briefWithFiveCaps = {
    requestedCapabilities: ["payments", "auth", "ai-chat", "contact-form", "analytics"],
  };

  it("returns an empty selection for scoped [] even when the brief has capabilities", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: [],
      brief: briefWithFiveCaps,
      disableBriefFallback: true,
    });
    expect(result.selected).toEqual([]);
  });

  it("keeps the legacy brief fallback when the flag is absent", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: [],
      brief: briefWithFiveCaps,
    });
    expect(result.selected.length).toBeGreaterThan(0);
  });

  it("does not affect non-empty scoped lists", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
      brief: briefWithFiveCaps,
      disableBriefFallback: true,
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("stripe-checkout");
    expect(ids).not.toContain("openai-chat");
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
      requestedCapabilities: ["gallery-lightbox"],
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
    const gallery = all.find((d) => d.id === "gallery-lightbox");
    expect(stripe?.codeFidelity).toBe("verbatim");
    expect(gallery?.codeFidelity).toBe("rewritable");
  });
});
