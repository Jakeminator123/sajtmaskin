import { describe, expect, it } from "vitest";

import {
  enforceFollowUpCapabilityFloor,
  filterDossierCapabilitiesForPrompt,
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
  type BuildIntentPromotionInput,
} from "./orchestrate";
import { dossierRequiresF3, getF3RequiredCapabilities } from "./dossiers";
import type { DossierEnvVar } from "./dossiers";
import type { BuildSpec, BuildSpecQualityTarget } from "./build-spec";

function makeBuildSpec(overrides: Partial<BuildSpec> = {}): BuildSpec {
  return {
    buildIntent: "website",
    generationMode: "followUp",
    changeScope: "redesign",
    scaffoldId: null,
    routePlanSummary: "",
    stylePack: "neutral",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "standard",
    contextPolicy: "light",
    referenceCategories: [],
    forbiddenPatterns: [],
    tokenBudgets: {
      scaffoldChars: 6_250,
      refsChars: 4_000,
      systemContextChars: 16_000,
    },
    ...overrides,
  } satisfies BuildSpec;
}

// Blocking-lane coverage for the Bugg B floor-shrink (Codex P1 on #447: the
// stability copy of this contract lives in a non-default vitest config; this
// duplicate keeps the shrink behaviour gated by the ordinary test:ci lane too).
describe("enforceFollowUpCapabilityFloor — explicit removal shrink (blocking lane)", () => {
  it("drops an explicitly removed integration from both resolved set and floor", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["hero", "payments"],
      contractCapabilities: ["payments", "hero"],
      removedCapabilities: ["payments"],
    });
    expect(decision.capabilities).toEqual(["hero"]);
    expect(decision.restoredCapabilities).toEqual([]);
    expect(decision.floorApplied).toBe(false);
  });

  it("keeps pure can-only-grow when removedCapabilities is absent", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["hero"],
      contractCapabilities: ["payments"],
    });
    expect(decision.capabilities).toEqual(["hero", "payments"]);
    expect(decision.floorApplied).toBe(true);
  });
});

describe("inheritQualityTargetFromPriorVersion (P22)", () => {
  it("inherits prior qualityTarget upward (e.g. standard base, premium prior)", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "standard" satisfies BuildSpecQualityTarget,
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result.qualityTarget).toBe("premium");
    expect(result).not.toBe(baseSpec);
  });

  it("does NOT inherit when prior target would lower rank (premium base, standard prior)", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "standard");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("premium");
  });

  it("does NOT inherit when prior would lower release-candidate (F3) → premium", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "release-candidate",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("release-candidate");
  });

  it("leaves baseSpec untouched when no prior qualityTarget is provided", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, null);
    expect(result).toBe(baseSpec);
  });

  it("does not inherit on init runs even when a prior target is given", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "init",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "release-candidate");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("premium");
  });

  it("is a no-op when prior target equals current target", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result).toBe(baseSpec);
  });
});

describe("resolveBuildIntentPromotion (P26 / OMTAG Fas 2·A)", () => {
  function makeInput(
    overrides: Partial<BuildIntentPromotionInput> = {},
  ): BuildIntentPromotionInput {
    return {
      buildIntent: "website",
      scaffoldMode: "auto",
      resolvedScaffoldId: "app-shell",
      selectionConfidence: "high",
      resolvedMode: "init",
      persistedScaffoldId: null,
      ignorePersistedScaffoldForMatch: false,
      ...overrides,
    };
  }

  it("promotes website -> app on init when auto matcher lands on app-shell with confidence", () => {
    const result = resolveBuildIntentPromotion(makeInput({ resolvedMode: "init" }));
    expect(result.wouldPromote).toBe(true);
    expect(result.blockedForFollowUp).toBe(false);
    expect(result.promoted).toBe(true);
  });

  it("blocks promotion on follow-up when a persisted non-app scaffold is pinned (P26 regression)", () => {
    // This is the P26 bug: a bildbyte on a landing-page project made the
    // scaffold matcher fallback to `app-shell`, which then promoted the
    // whole chat's build_intent to `app`. The fix suppresses promotion on
    // follow-ups whose persisted scaffold is non-app.
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "landing-page",
      }),
    );
    expect(result.wouldPromote).toBe(true);
    expect(result.blockedForFollowUp).toBe(true);
    expect(result.promoted).toBe(false);
  });

  it("still promotes follow-up when persisted scaffold is already app-type", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "app-shell",
      }),
    );
    expect(result.promoted).toBe(true);
  });

  it("promotes follow-up when caller opts into clear-redesign (ignorePersistedScaffoldForMatch)", () => {
    // clear-redesign runs explicitly release the scaffold lock. Promotion
    // has to go through in that case; the guard only fires when the lock is
    // actually in effect.
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "landing-page",
        ignorePersistedScaffoldForMatch: true,
      }),
    );
    expect(result.promoted).toBe(true);
  });

  it("does not promote when selection confidence is low", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({ selectionConfidence: "low" }),
    );
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when the resolved scaffold is not an app scaffold", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({ resolvedScaffoldId: "landing-page" }),
    );
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when the user already asked for an app build", () => {
    // `app` inputs never feed through the promotion path — promotion only
    // triggers on `website` → `app`.
    const result = resolveBuildIntentPromotion(makeInput({ buildIntent: "app" }));
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when scaffoldMode is manual (user pinned the scaffold explicitly)", () => {
    const result = resolveBuildIntentPromotion(makeInput({ scaffoldMode: "manual" }));
    expect(result.wouldPromote).toBe(false);
  });
});

describe("filterDossierCapabilitiesForPrompt (#198 physics-3d invariant)", () => {
  it("drops physics-3d when visual-3d is gated out on a non-3D prompt", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["physics-3d", "visual-3d"],
      prompt: "a cinematic landing page for a law firm",
      previewPolicy: "fidelity2",
    });
    // visual-3d is dropped (no explicit 3D request) → physics-3d must follow,
    // otherwise we ship a physics dossier with no Three.js renderer.
    expect(result).not.toContain("visual-3d");
    expect(result).not.toContain("physics-3d");
  });

  it("keeps physics-3d when the prompt explicitly requests 3D", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["physics-3d", "visual-3d"],
      prompt: "a three.js webgl scene with gravity and falling objects",
      previewPolicy: "fidelity2",
    });
    expect(result).toContain("visual-3d");
    expect(result).toContain("physics-3d");
  });

  it("leaves unrelated capabilities untouched", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["parallax-scroll", "command-search"],
      prompt: "a marketing site",
      previewPolicy: "fidelity2",
    });
    expect(result).toEqual(["parallax-scroll", "command-search"]);
  });
});

describe("filterDossierCapabilitiesForPrompt (dossier wave 3: supabase-auth vs auth)", () => {
  // Non-competition contract: on an explicit Supabase prompt the inferred
  // `needsAuth` bridge still adds generic `auth` (its patterns match the
  // "login"/"auth" inside "supabase login"), but clerk-auth must never be
  // injected alongside supabase-auth — both ship a root middleware.ts.
  it("drops generic auth when supabase-auth is explicitly selected (F3)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["supabase-auth", "auth"],
      prompt: "medlemssida med supabase login",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("supabase-auth");
    expect(result).not.toContain("auth");
  });

  it("keeps generic auth (clerk) when supabase-auth is not requested (F3)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["auth"],
      prompt: "medlemssida med inloggning",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("auth");
  });

  it("mutes supabase-auth in F2 like other server-surface integrations", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["supabase-auth"],
      prompt: "medlemssida med supabase login",
      previewPolicy: "fidelity2",
    });
    expect(result).not.toContain("supabase-auth");
  });
});

describe("filterDossierCapabilitiesForPrompt (subscriptions vs payments dedup)", () => {
  // Inferred/ambiguous `payments` is dropped when `subscriptions` is present so
  // a recurring ask does not also inject Stripe checkout (bugbot high).
  it("drops inferred payments when subscriptions is present (F3)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["subscriptions", "payments"],
      prompt: "lägg till återkommande medlemskap med paddle",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("subscriptions");
    expect(result).not.toContain("payments");
  });

  // Codex P2 dossier-batch: an EXPLICIT one-off checkout alongside memberships
  // keeps both — the two dossiers ship distinct output paths (no collision).
  it("keeps explicit one-off payments alongside subscriptions (F3)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["subscriptions", "payments"],
      prompt: "medlemskap med paddle och en engångsbetalning för merch-köp",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("subscriptions");
    expect(result).toContain("payments");
  });
});

describe("filterDossierCapabilitiesForPrompt (dependent capability: subscriptions ⇒ supabase-auth)", () => {
  // Codex P1 #475: paddle's customer-portal requires a signed-in Supabase
  // user — a bare `subscriptions` selection must pull the supabase-auth stack
  // (middleware, callback, sign-in surface) or the portal path is always 401.
  it("expands subscriptions with supabase-auth in F3", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["subscriptions"],
      prompt: "lägg till prenumerationer för medlemmar",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("subscriptions");
    expect(result).toContain("supabase-auth");
  });

  it("drops tag-along generic auth in favor of the required supabase-auth (F3)", () => {
    // Inferred `needsAuth` can add generic `auth` on a membership prompt; the
    // expansion adds supabase-auth, and the existing dedup must then drop
    // `auth` so clerk-auth's root middleware never collides.
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["subscriptions", "auth"],
      prompt: "medlemssida med prenumerationer och inloggning",
      previewPolicy: "fidelity3",
    });
    expect(result).toContain("subscriptions");
    expect(result).toContain("supabase-auth");
    expect(result).not.toContain("auth");
  });

  it("does NOT expand in F2 — subscriptions is muted before expansion runs", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["subscriptions"],
      prompt: "lägg till prenumerationer för medlemmar",
      previewPolicy: "fidelity2",
    });
    expect(result).not.toContain("subscriptions");
    expect(result).not.toContain("supabase-auth");
  });
});

describe("dossierRequiresF3 (single F3 signal: build envVars OR server-file surface)", () => {
  const envVar = (
    key: string,
    enforcement?: DossierEnvVar["enforcement"],
  ): DossierEnvVar => ({ key, required: true, purpose: "test", enforcement });

  it("is true when any env var is build-enforced", () => {
    expect(dossierRequiresF3({ envVars: [envVar("STRIPE_SECRET_KEY", "build")] })).toBe(true);
  });

  it("defaults a missing enforcement to build (requires F3)", () => {
    expect(dossierRequiresF3({ envVars: [envVar("SOME_KEY")] })).toBe(true);
  });

  it("is false for a self-contained dossier (no env vars) — e.g. a snake game", () => {
    expect(dossierRequiresF3({ envVars: [] })).toBe(false);
    expect(dossierRequiresF3({})).toBe(false);
  });

  it("is false when every env var is warn-only / feature-runtime AND all files are client-side", () => {
    expect(
      dossierRequiresF3({
        envVars: [envVar("SENTRY_DSN", "warn-only"), envVar("PLAUSIBLE_DOMAIN", "feature-runtime")],
        files: [{ path: "components/widget.tsx", role: "client" }],
      }),
    ).toBe(false);
  });

  it("is true when the dossier ships a server-role file even without build secrets (resend-contact-form pattern)", () => {
    expect(
      dossierRequiresF3({
        envVars: [
          envVar("RESEND_API_KEY", "feature-runtime"),
          envVar("EMAIL_FROM", "feature-runtime"),
          envVar("CONTACT_EMAIL_TO", "feature-runtime"),
        ],
        files: [
          { path: "components/contact-form.tsx", role: "client" },
          { path: "components/api/contact/route.ts", role: "server" },
        ],
      }),
    ).toBe(true);
  });
});

describe("getF3RequiredCapabilities (derived from the real dossier contract)", () => {
  it("derives secret-backed integrations from envVars, not a hardcoded list", () => {
    const caps = getF3RequiredCapabilities();
    // Build-enforced secrets (Stripe / Clerk / OpenAI).
    expect(caps.has("payments")).toBe(true);
    expect(caps.has("auth")).toBe(true);
    expect(caps.has("ai-chat")).toBe(true);
  });

  it("derives server-file integrations (resend/mailchimp/sentry) via the server-file rule", () => {
    const caps = getF3RequiredCapabilities();
    // No build secrets, but real server wiring → F3.
    expect(caps.has("contact-form")).toBe(true);
    expect(caps.has("newsletter-subscribe")).toBe(true);
    expect(caps.has("error-tracking")).toBe(true);
    // Analytics has neither a build-enforced env nor a server file → stays a
    // pure F2-mute POLICY residual, not derived from the dossier contract.
    expect(caps.has("analytics")).toBe(false);
  });
});

describe("F2/F3 integration mute (contract-derived + policy residual)", () => {
  const integrationCaps = [
    "payments",
    "auth",
    "ai-chat",
    "analytics",
    "error-tracking",
    "contact-form",
    "newsletter-subscribe",
    // Dossier wave 2: all three database dossiers ship server-role files
    // (lib helpers + /api/health/db), so `database` derives into the F3 set
    // via dossierRequiresF3 — F2 renders seed data instead (see the dossiers'
    // seed-fallback contract).
    "database",
  ];

  it("mutes all integration capabilities in F2 (design)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: integrationCaps,
      prompt: "a bakery site with a checkout, login, analytics and a chatbot",
      previewPolicy: "fidelity2",
    });
    for (const cap of integrationCaps) {
      expect(result).not.toContain(cap);
    }
  });

  it("keeps integration capabilities in F3 (integrations)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: integrationCaps,
      prompt: "a bakery site with a checkout, login, analytics and a chatbot",
      previewPolicy: "fidelity3",
    });
    for (const cap of integrationCaps) {
      expect(result).toContain(cap);
    }
  });

  it("does NOT mute a self-contained game capability in F2 (no env → fully F2)", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["interactive-game"],
      prompt: "a landing page with a snake game about beer barrels",
      previewPolicy: "fidelity2",
    });
    expect(result).toContain("interactive-game");
  });

  it("mutes contact-form in F2 even when the prompt explicitly asks to send email", () => {
    // The former `explicitlyRequestsContactDelivery` escape hatch injected the
    // resend dossier into F2 whenever the prompt mentioned sending email —
    // contradicting the F2 SDK deny-list (`resend` is a forbidden F2 import),
    // whose guard then stripped the import from the verbatim `/api/contact`
    // route and shipped a broken endpoint. Email delivery is strictly F3 now;
    // F2 renders the form as a visual mockup per the F2 contract.
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["contact-form"],
      prompt: "Skapa en kontaktsida som skickar mejl till oss med Resend",
      previewPolicy: "fidelity2",
    });
    expect(result).not.toContain("contact-form");
  });
});
