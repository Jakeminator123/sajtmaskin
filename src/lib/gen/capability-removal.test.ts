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
      needsAuth: true,
      needsDatabase: true,
    }),
    ["payments", "auth"],
  );

  expect(result.needsPayments).toBe(false);
  expect(result.needsAuth).toBe(false);
  expect(result.needsDatabase).toBe(true);
});

describe("filterRemovedCapabilitiesFromContracts", () => {
  it("removes dossierless and unresolved contracts by their canonical capability", () => {
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "persisted",
        integrations: [
          {
            kind: "database",
            providerKey: "mongodb",
            dossierCapability: "database",
            selectionSource: "explicit",
            provider: "MongoDB",
            name: "MongoDB",
            reason: "explicit",
            status: "chosen",
            envVars: ["MONGODB_URI"],
          },
          {
            kind: "auth",
            dossierCapability: "auth",
            selectionSource: "explicit",
            provider: "Authentication provider not selected",
            name: "Authentication provider not selected",
            reason: "rejected",
            status: "unresolved",
          },
        ],
        envVars: [{ key: "MONGODB_URI", reason: "MongoDB" }],
      },
      unresolvedDecisions: [],
    };
    const withoutAuth = filterRemovedCapabilitiesFromContracts(context, ["auth"]);
    expect(withoutAuth.contracts.integrations.map((item) => item.providerKey)).toEqual(["mongodb"]);
    const withoutDatabase = filterRemovedCapabilitiesFromContracts(context, ["database"]);
    expect(withoutDatabase.contracts.integrations).toHaveLength(1);
    expect(withoutDatabase.contracts.integrations[0]?.status).toBe("unresolved");
    expect(withoutDatabase.contracts.envVars).toEqual([]);
  });

  it.each([
    ["database", "database", "prisma", "databaseProvider"],
    ["payments", "payment", "stripe-elements", "paymentProvider"],
    ["auth", "auth", "custom-auth-method", "authProvider"],
  ] as const)(
    "removes %s method-only contracts and clears its top-level provider",
    (removedCapability, kind, methodKey, providerField) => {
      const context: PreGenerationContractContext = {
        contracts: {
          dataMode: "persisted",
          databaseProvider: "Legacy database label",
          authProvider: "Legacy auth label",
          paymentProvider: "Legacy payment label",
          integrations: [
            {
              kind,
              providerKey: methodKey,
              provider: methodKey,
              name: methodKey,
              reason: "method",
              status: "chosen",
            },
          ],
          envVars: [],
        },
        unresolvedDecisions: [],
      };

      const result = filterRemovedCapabilitiesFromContracts(context, [removedCapability]);

      expect(result.contracts.integrations).toEqual([]);
      expect(result.contracts[providerField]).toBeUndefined();
    },
  );
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

  it("removes ambiguous postgres through dossier-id fallback when database is removed", () => {
    // `postgres` is claimed by multiple manifests → mapProviderKeys returns [];
    // the dossier-id fallback under `database` still matches postgres-drizzle.
    const context: PreGenerationContractContext = {
      contracts: {
        dataMode: "mixed",
        databaseProvider: "postgres",
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "one-off",
            status: "chosen",
            envVars: ["STRIPE_SECRET_KEY"],
          },
          {
            provider: "postgres",
            name: "Postgres",
            reason: "storage",
            status: "chosen",
            envVars: ["DATABASE_URL"],
          },
        ],
        envVars: [
          { key: "STRIPE_SECRET_KEY", reason: "Stripe" },
          { key: "DATABASE_URL", reason: "Postgres" },
        ],
      },
      unresolvedDecisions: [],
    };

    const result = filterRemovedCapabilitiesFromContracts(context, ["database"]);

    expect(result.contracts.databaseProvider).toBeUndefined();
    expect(result.contracts.integrations.map((item) => item.provider)).toEqual([
      "stripe",
    ]);
    expect(result.contracts.envVars.map((item) => item.key)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
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
  // `supabase` is forced-generic in tier3-build-spec (a BaaS key never picks
  // the auth dossier), but the dossier-id fallback (`supabase` prefix of
  // `supabase-auth`) still attributes it to a removed `auth`.
  expect(
    filterProvidersForRemovedCapabilities(
      ["stripe", "paddle", "supabase"],
      ["auth"],
    ),
  ).toEqual(["stripe", "paddle"]);
  // Parked subscriptions is a no-op — nothing maps to it anymore.
  expect(
    filterProvidersForRemovedCapabilities(
      ["stripe", "paddle", "supabase"],
      ["subscriptions"],
    ),
  ).toEqual(["stripe", "paddle", "supabase"]);

  const supabaseContracts: PreGenerationContractContext["contracts"]["integrations"] = [
    {
      kind: "database",
      providerKey: "supabase",
      dossierCapability: "database",
      provider: "Supabase",
      name: "Supabase",
      reason: "Approved database provider.",
      status: "chosen",
    },
    {
      kind: "auth",
      providerKey: "supabase",
      dossierCapability: "auth",
      provider: "Supabase",
      name: "Supabase Auth",
      reason: "Independent active auth provider.",
      status: "chosen",
    },
  ];
  expect(
    filterProvidersForRemovedCapabilities(["supabase"], ["database"], supabaseContracts),
  ).toEqual([]);
  expect(
    filterProvidersForRemovedCapabilities(
      ["supabase"],
      ["database"],
      supabaseContracts.filter((contract) => contract.dossierCapability === "auth"),
    ),
  ).toEqual(["supabase"]);
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
