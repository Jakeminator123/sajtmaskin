/**
 * Tests for the new deterministic, capability-driven dossier selection.
 * No mocked filesystem — these run against the real data/dossiers/ pool.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDossierRegistryCache, getAllDossiers } from "./registry";
import { isExplicitDossierChoice, selectDossiersForRequest } from "./select";

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
  // (`Lägg till byggblocket "Inloggning — Supabase" (id: supabase-auth)`). The
  // id must count as explicit sibling intent so the pick beats the capability
  // default (clerk-auth) even when no manifest relevanceKeyword appears in
  // the label. (Fixture moved from mongodb-atlas when that dossier was parked
  // 2026-08-06 — the mechanism under test is id-referencing, not the
  // specific sibling.)
  it("picks an explicitly id-referenced sibling over the capability default", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: 'Lägg till byggblocket "Inloggning — Supabase" (id: supabase-auth)',
    });
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("still picks the capability default when the default's own id is referenced", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: 'Lägg till byggblocket "Inloggning — Clerk" (id: clerk-auth)',
    });
    expect(result.selected[0]?.entry.id).toBe("clerk-auth");
  });

  it("selects nothing for a parked dossier id (etapp 3 database siblings)", () => {
    const parked = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: 'Lägg till byggblocket "MongoDB" (id: mongodb-atlas)',
    });
    expect(parked.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
    expect(parked.selected[0]?.reason).toBe("capability-match");

    const unknownCap = selectDossiersForRequest({
      requestedCapabilities: ["mongodb-atlas"],
    });
    expect(unknownCap.selected).toEqual([]);
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
// Capability `database` (etapp 3, 2026-08-06): postgres-drizzle is the sole
// live dossier. neon-postgres / mongodb-atlas are parked — a Mongo/Neon brand
// ask still means `database` upstream, but selection always yields
// postgres-drizzle. Sibling relevanceKeywords live under `auth` instead.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — database sole dossier (etapp 3)", () => {
  it("picks postgres-drizzle (sole) for a generic database ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "en bokningssajt som sparar bokningar i en databas",
    });
    expect(result.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
    expect(result.selected[0]?.reason).toBe("capability-match");
  });

  it("picks postgres-drizzle when no prompt text is supplied", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
    });
    expect(result.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
  });

  it("still picks postgres-drizzle on an explicit MongoDB ask (siblings parked)", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "lagra produkterna i MongoDB Atlas",
    });
    expect(result.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
    expect(result.selected[0]?.reason).toBe("capability-match");
  });

  it("still picks postgres-drizzle on a DB-flavoured Neon ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["database"],
      promptText: "hosta medlemsregistret på neon.tech",
    });
    expect(result.selected.map((s) => s.entry.id)).toEqual(["postgres-drizzle"]);
  });

  it("keeps postgres-drizzle alongside payments when Mongo is named", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments", "database"],
      promptText: "checkout med stripe och spara ordrar i mongodb",
    });
    const byId = new Map(result.selected.map((s) => [s.entry.capability, s.entry.id]));
    expect(byId.get("payments")).toBe("stripe-checkout");
    expect(byId.get("database")).toBe("postgres-drizzle");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// relevanceKeywords disambiguation — locked via auth siblings (clerk default
// / supabase on explicit ask). Same mechanism that formerly covered database
// siblings before etapp 3 parked neon-postgres + mongodb-atlas.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — relevanceKeywords disambiguation (auth)", () => {
  it("picks clerk-auth (default) for a generic auth ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "lägg till inloggning för medlemmarna",
    });
    expect(result.selected[0]?.entry.id).toBe("clerk-auth");
    expect(result.selected[0]?.reason).toBe("capability-match");
  });

  it("picks supabase-auth on an explicit Supabase ask", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "logga in med supabase",
    });
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("matches hyphenated provider forms of multi-word keywords (supabase-auth)", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "sätt upp supabase-auth för kundkonton",
    });
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.reason).toBe("relevance-keyword");
  });

  it("picks supabase-auth on 'login with supabase'", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "add login with supabase for the members area",
    });
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
  });

  it("keyword override is scoped to the shared capability — other selections untouched", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments", "auth"],
      promptText: "checkout med stripe och logga in med supabase",
    });
    const byId = new Map(result.selected.map((s) => [s.entry.capability, s.entry.id]));
    expect(byId.get("payments")).toBe("stripe-checkout");
    expect(byId.get("auth")).toBe("supabase-auth");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dependent capabilities: DEPENDENT_CAPABILITIES is empty since 2026-08-06
// (subscriptions ⇒ auth-pin left with parked paddle-billing). Expansion is a
// no-op; alias-normalization only. The ai-tool-calling/ai-chat dedup died
// with etapp 4.
// ─────────────────────────────────────────────────────────────────────────
describe("selectDossiersForRequest — dependent capabilities", () => {
  it("selects nothing for the parked subscriptions capability (empty table)", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["subscriptions"],
    });
    expect(result.selected).toEqual([]);
  });

  it("does not pull auth when only payments is requested", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["payments"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("stripe-checkout");
    expect(ids).not.toContain("supabase-auth");
    expect(ids).not.toContain("clerk-auth");
  });

  it("resolves the legacy 'supabase-auth' capability alias to the pinned dossier under `auth`", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["supabase-auth"],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(result.selected[0]?.entry.capability).toBe("auth");
    expect(result.selected[0]?.reason).toBe("dependency-pin");
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

  it("keeps ai-chat beside a stale ai-tool-calling id — no dedup after etapp 4", () => {
    // Parked capability selects nothing; live ai-chat still resolves.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["ai-tool-calling", "ai-chat"],
    });
    const ids = result.selected.map((s) => s.entry.id);
    expect(ids).toContain("openai-chat");
    expect(ids).not.toContain("ai-tool-calling-chat");
  });

  it("selects nothing for parked AI sibling capabilities alone", () => {
    const tool = selectDossiersForRequest({
      requestedCapabilities: ["ai-tool-calling"],
    });
    const rag = selectDossiersForRequest({
      requestedCapabilities: ["rag-chat"],
    });
    expect(tool.selected).toEqual([]);
    expect(rag.selected).toEqual([]);
  });

  it("keeps ai-chat when only ai-chat is requested", () => {
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
describe("selectDossiersForRequest — disableBriefFallback (F3 scope / F2 mute)", () => {
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
// isExplicitDossierChoice: skiljer ett faktiskt providerval från
// capability-defaulten. `resolve-base` persisterar bara de förstnämnda som
// `mutedDossierIds`, eftersom ett persisterat default-id ser ut som ett byte
// och skriver över ett tidigare val vid nästa neutrala uppföljning.
// ─────────────────────────────────────────────────────────────────────────
describe("isExplicitDossierChoice — persisterbar syskonidentitet", () => {
  it("räknar ett uttryckligt providerval som val", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "logga in med supabase",
    });

    expect(result.selected[0]?.entry.id).toBe("supabase-auth");
    expect(isExplicitDossierChoice(result.selected[0].reason)).toBe(true);
  });

  it("räknar INTE capability-defaulten som val på en neutral uppföljning", () => {
    // "gör rubriken större" bär ingen providerhint, men capability-floor:en
    // håller kvar `auth`. Utan filtret hade clerk-auth persisterats och
    // skrivit över ett tidigare supabase-auth.
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "gör rubriken större",
    });

    expect(result.selected[0]?.entry.id).toBe("clerk-auth");
    expect(result.selected[0]?.reason).toBe("capability-match");
    expect(isExplicitDossierChoice(result.selected[0].reason)).toBe(false);
  });

  it("räknar en dependency-pin som val — den är ett krav, inte en gissning", () => {
    expect(isExplicitDossierChoice("dependency-pin")).toBe(true);
    const result = selectDossiersForRequest({
      requestedCapabilities: ["supabase-auth"],
    });
    expect(result.selected[0]?.reason).toBe("dependency-pin");
    expect(isExplicitDossierChoice(result.selected[0]!.reason)).toBe(true);
  });

  it("släpper igenom bara valet när prompten nämner ett syskon av flera capabilities", () => {
    const result = selectDossiersForRequest({
      requestedCapabilities: ["auth", "payments"],
      promptText: "logga in med supabase",
    });
    const persisted = result.selected
      .filter((s) => isExplicitDossierChoice(s.reason))
      .map((s) => s.entry.id);

    expect(persisted).toEqual(["supabase-auth"]);
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
