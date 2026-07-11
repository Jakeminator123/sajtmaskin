import { describe, expect, it } from "vitest";
import type { InferredCapabilities } from "./capability-inference";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import type { DossierEntry } from "./dossiers";
import {
  buildCapabilityRemovalHint,
  filterRemovedCapabilitiesFromBriefSummary,
  filterRemovedCapabilitiesFromContracts,
  filterProvidersForRemovedCapabilities,
  suppressRemovedInferredCapabilities,
} from "./capability-removal";

function capabilities(
  overrides: Partial<InferredCapabilities> = {},
): InferredCapabilities {
  return {
    needsMotion: false,
    needs3D: false,
    needsPhysics: false,
    needsParallax: false,
    needsPayments: false,
    needsSubscriptions: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsGame: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
    needsCalendar: false,
    needsCommandSearch: false,
    needsThemeToggle: false,
    ...overrides,
  };
}

it("suppresses raw inferred flags for explicitly removed capabilities", () => {
  const result = suppressRemovedInferredCapabilities(
    capabilities({
      needsPayments: true,
      needsSubscriptions: true,
      needsAuth: true,
    }),
    ["payments", "auth"],
  );

  expect(result.needsPayments).toBe(false);
  expect(result.needsAuth).toBe(false);
  expect(result.needsSubscriptions).toBe(true);
});

describe("filterRemovedCapabilitiesFromContracts", () => {
  it("removes only the removed provider contracts and their exclusive env keys", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "mixed",
        paymentProvider: "stripe",
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "one-off checkout",
            status: "chosen",
            envVars: ["STRIPE_SECRET_KEY"],
          },
          {
            provider: "paddle",
            name: "Paddle",
            reason: "subscriptions",
            status: "chosen",
            envVars: ["PADDLE_API_KEY"],
          },
        ],
        envVars: [
          { key: "STRIPE_SECRET_KEY", reason: "Stripe" },
          { key: "PADDLE_API_KEY", reason: "Paddle" },
        ],
      },
      unresolvedDecisions: [{ kind: "payment", reason: "pick provider" }],
      confirmedAnswers: [],
    };

    const result = filterRemovedCapabilitiesFromContracts(context, ["payments"]);

    expect(result.contracts.paymentProvider).toBeUndefined();
    expect(result.contracts.integrations.map((item) => item.provider)).toEqual([
      "paddle",
    ]);
    expect(result.contracts.envVars.map((item) => item.key)).toEqual([
      "PADDLE_API_KEY",
    ]);
    expect(result.unresolvedDecisions).toEqual([]);
  });

  it("removes Paddle through dossier fallback even without a registry entry", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "mixed",
        paymentProvider: "paddle",
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "one-off",
            status: "chosen",
            envVars: ["STRIPE_SECRET_KEY"],
          },
          {
            provider: "paddle",
            name: "Paddle",
            reason: "recurring",
            status: "chosen",
            envVars: ["PADDLE_API_KEY"],
          },
        ],
        envVars: [
          { key: "STRIPE_SECRET_KEY", reason: "Stripe" },
          { key: "PADDLE_API_KEY", reason: "Paddle" },
        ],
      },
      unresolvedDecisions: [],
      confirmedAnswers: [],
    };

    const result = filterRemovedCapabilitiesFromContracts(context, [
      "subscriptions",
    ], ["payments"]);

    expect(result.contracts.paymentProvider).toBeUndefined();
    expect(result.contracts.integrations.map((item) => item.provider)).toEqual([
      "stripe",
    ]);
    expect(result.contracts.envVars.map((item) => item.key)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);

    const noRetainedPayment = filterRemovedCapabilitiesFromContracts(
      context,
      ["subscriptions"],
    );
    expect(noRetainedPayment.contracts.integrations).toEqual([]);
    expect(noRetainedPayment.contracts.paymentProvider).toBeUndefined();
  });
});

it("shrinks stale brief capabilities so later follow-ups cannot resurrect them", () => {
  expect(
    filterRemovedCapabilitiesFromBriefSummary(
      { requestedCapabilities: ["payments", "auth"], projectTitle: "Demo" },
      ["payments"],
    ),
  ).toEqual({
    requestedCapabilities: ["auth"],
    projectTitle: "Demo",
  });
});

it("removes stale F3 provider approvals for removed capabilities", () => {
  expect(
    filterProvidersForRemovedCapabilities(
      ["stripe", "paddle"],
      ["payments"],
    ),
  ).toEqual(["paddle"]);
  expect(
    filterProvidersForRemovedCapabilities(
      ["stripe", "paddle", "supabase"],
      ["subscriptions"],
    ),
  ).toEqual(["stripe", "supabase"]);
});

it("builds a removal instruction from the exact removed dossier files", () => {
  const dossier = {
    id: "stripe-checkout",
    capability: "payments",
    files: [
      { path: "app/api/checkout-session/route.ts", mode: "verbatim" },
      { path: "components/checkout-button.tsx", mode: "rewritable" },
    ],
  } as unknown as DossierEntry;

  const hint = buildCapabilityRemovalHint(["payments"], [dossier]);

  expect(hint).toContain("explicitly removed: payments");
  expect(hint).toContain("app/api/checkout-session/route.ts");
  expect(hint).toContain("components/checkout-button.tsx");
});
