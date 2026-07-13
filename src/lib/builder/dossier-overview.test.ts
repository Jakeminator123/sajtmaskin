import { describe, expect, it } from "vitest";
import {
  describeDossierStatus,
  describeEnvKeyValueState,
  selectedDossiersFromOverview,
  type DossierOverviewEntry,
} from "./dossier-overview";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";

describe("describeEnvKeyValueState", () => {
  it("treats a stored real value as filled regardless of enforcement", () => {
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: true,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Ifylld");
    expect(state.tone).toBe("success");
  });

  it("flags a build-enforced key without a value as a hard requirement", () => {
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: false,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Kräver riktigt värde");
    expect(state.tone).toBe("warning");
  });

  it("prioritizes the build requirement over placeholder coverage (no false green)", () => {
    // A build key that happens to be placeholder-covered must still read as a
    // requirement — otherwise the panel would look satisfied while the F3 gate
    // treats the same key as missing.
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: false,
      placeholderCovered: true,
    });
    expect(state.label).toBe("Kräver riktigt värde");
    expect(state.tone).toBe("warning");
  });

  // Owner decision 2026-07-13 (PR 1): a feature-runtime key without a real
  // value is "add for live", NOT a muted auto-placeholder note — the demo
  // fallback is what actually runs, and placeholder coverage only keeps the
  // preview booting. The attention surface depends on this being a warning.
  it("flags a feature-runtime key without a value as 'add for live' even when placeholder-covered", () => {
    const state = describeEnvKeyValueState({
      enforcement: "feature-runtime",
      hasRealValue: false,
      placeholderCovered: true,
    });
    expect(state.label).toBe("Lägg till för livefunktion");
    expect(state.tone).toBe("warning");
  });

  it("marks a placeholder-covered warn-only key as auto-handled in F2", () => {
    const state = describeEnvKeyValueState({
      enforcement: "warn-only",
      hasRealValue: false,
      placeholderCovered: true,
    });
    expect(state.label).toBe("Auto-placeholder i F2");
    expect(state.tone).toBe("muted");
  });

  it("marks an uncovered optional key as optional", () => {
    const state = describeEnvKeyValueState({
      enforcement: "warn-only",
      hasRealValue: false,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Valfri");
    expect(state.tone).toBe("muted");
  });
});

describe("describeDossierStatus", () => {
  it("never claims live for built-demo (the demo fallback is running)", () => {
    const demo = describeDossierStatus("built-demo", "design");
    expect(demo.label).toBe("Byggd — demo aktiv");
    expect(demo.tone).toBe("warning");

    const live = describeDossierStatus("built-live", "integrations");
    expect(live.label).toBe("Byggd — live");
    expect(live.tone).toBe("success");
  });

  it("labels a build-key-blocked dossier as blocked in both stages", () => {
    expect(describeDossierStatus("blocked-build", "design").label).toBe(
      "Blockerad — nyckel krävs",
    );
    expect(describeDossierStatus("blocked-build", "integrations").label).toBe(
      "Blockerad — nyckel krävs",
    );
  });

  it("labels planned per stage", () => {
    expect(describeDossierStatus("planned", "design").label).toBe("Planerad (F2-mockup)");
    expect(describeDossierStatus("planned", "integrations").label).toBe("Planerad — ej byggd");
  });
});

// F3 env-panel parity: the panel scopes detection to the chat's selected
// dossiers so a matching dossier's per-key enforcement flows through and an
// UNMATCHED integration downgrades to warn-only (instead of build-blocking).
describe("selectedDossiersFromOverview", () => {
  function overviewEntry(
    overrides: Partial<DossierOverviewEntry> = {},
  ): DossierOverviewEntry {
    return {
      id: "resend-contact-form",
      label: "Resend Contact Form",
      class: "hard",
      capability: "contact-form",
      summary: "Contact form via Resend.",
      complexity: "medium",
      requiresF3: true,
      configured: false,
      dependencies: ["resend"],
      envVars: [
        {
          key: "RESEND_API_KEY",
          required: true,
          enforcement: "feature-runtime",
          purpose: "Resend API auth.",
          hasRealValue: false,
          placeholderCovered: false,
        },
      ],
      status: "planned",
      missingKeys: [],
      missingLiveKeys: ["RESEND_API_KEY"],
      lastVerified: "2026-04-20",
      ...overrides,
    };
  }

  it("carries per-key enforcement into the detector so a matched integration keeps warn/feature-runtime", () => {
    const selected = selectedDossiersFromOverview([overviewEntry()]);
    expect(selected[0].entry.envVars).toEqual([
      {
        key: "RESEND_API_KEY",
        required: true,
        purpose: "Resend API auth.",
        enforcement: "feature-runtime",
      },
    ]);

    const detected = detectIntegrationsFromVersionFiles(
      [
        {
          name: "app/api/contact/route.ts",
          content: "import { Resend } from 'resend';\nconst k = process.env.RESEND_API_KEY;",
        },
      ],
      { selectedDossiers: selected, lifecycleStage: "integrations" },
    );
    const resend = detected.find((d) => d.provider === "resend" || d.key === "resend");
    expect(resend?.envEnforcement?.RESEND_API_KEY).toBe("feature-runtime");
  });

  it("downgrades an UNMATCHED integration's keys to warn-only when a scoped (non-matching) dossier set is provided", () => {
    // A stripe reference with NO stripe dossier selected must not become a
    // build blocker in the panel (mirrors the readiness route).
    const selected = selectedDossiersFromOverview([overviewEntry()]);
    const detected = detectIntegrationsFromVersionFiles(
      [
        {
          name: "app/pricing/page.tsx",
          content: "const key = process.env.STRIPE_SECRET_KEY;",
        },
      ],
      { selectedDossiers: selected, lifecycleStage: "integrations" },
    );
    const stripe = detected.find((d) => d.key === "stripe" || d.provider === "stripe");
    expect(stripe?.envEnforcement?.STRIPE_SECRET_KEY).toBe("warn-only");
  });
});
