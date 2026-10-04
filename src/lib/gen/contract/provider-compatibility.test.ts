import { describe, expect, it } from "vitest";
import { selectDossiersForRequest } from "../dossiers/select";
import { resolveDossierFilePath } from "../dossiers/output-path";
import { getDossierFileContent } from "../dossiers/registry";
import type { PlanContracts } from "../plan/schema";
import { buildDossierIntegrationPlan } from "./provider-compatibility";

function contracts(
  integration: PlanContracts["integrations"][number],
): PlanContracts {
  return { dataMode: "persisted", integrations: [integration], envVars: [] };
}

describe("buildDossierIntegrationPlan", () => {
  it.each([
    ["database", "mongodb", "MongoDB", "postgres-drizzle"],
    ["auth", "auth0", "Auth0", "clerk-auth"],
    ["payments", undefined, "Payment provider not selected", "stripe-checkout"],
  ])("never injects capability default %s for an incompatible provider", (capability, providerKey, name, wrongId) => {
    const selection = selectDossiersForRequest({ requestedCapabilities: [capability] });
    expect(selection.selected.map((item) => item.entry.id)).toContain(wrongId);
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: capability === "payments" ? "payment" : capability === "auth" ? "auth" : "database",
        ...(providerKey ? { providerKey } : {}),
        dossierCapability: capability,
        selectionSource: "explicit",
        provider: name,
        name,
        reason: "Explicit provider contract",
        status: providerKey ? "chosen" : "unresolved",
      }),
      dossierSelection: selection,
      projectFiles: [],
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]?.disposition).toBe(providerKey ? "context-only" : "blocked");
  });

  it("keeps a supported explicit provider dossier", () => {
    const selection = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "Use Supabase auth",
    });
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "auth",
        providerKey: "supabase",
        dossierCapability: "auth",
        selectionSource: "explicit",
        provider: "Supabase",
        name: "Supabase",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: [],
    });
    expect(plan.dossierSelection.selected.map((item) => item.entry.id)).toEqual(["supabase-auth"]);
    expect(plan.decisions[0]?.disposition).toBe("dossier-supported");
  });

  it.each([
    ["auth", "clerk"],
    ["database", "postgres"],
    ["payments", "stripe"],
  ])(
    "normalizes the canonical %s dossier default into the shared contract owner",
    (capability, providerKey) => {
      const selection = selectDossiersForRequest({ requestedCapabilities: [capability] });
      const plan = buildDossierIntegrationPlan({
        contracts: { dataMode: "persisted", integrations: [], envVars: [] },
        dossierSelection: selection,
        projectFiles: [],
      });
      expect(plan.dossierSelection.selected).toHaveLength(1);
      expect(plan.contracts.integrations).toContainEqual(
        expect.objectContaining({
          providerKey,
          dossierCapability: capability,
          selectionSource: "dossier-default",
        }),
      );
    },
  );

  it("applies the owned-path gate even when the provider contract is missing", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["payments"] });
    const plan = buildDossierIntegrationPlan({
      contracts: { dataMode: "persisted", integrations: [], envVars: [] },
      dossierSelection: selection,
      projectFiles: [
        { path: "app/api/checkout-session/route.ts", content: "export const POST = custom;" },
      ],
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({ reasonCode: "owned-path-conflict" });
  });

  it.each([
    ["booking", "calcom-booking", "calcom"],
    ["newsletter-subscribe", "mailchimp-newsletter", "mailchimp"],
    ["analytics", "visitor-counter", "upstash"],
    ["contact-form", "resend-contact-form", "resend"],
  ])(
    "normalizes an ungoverned registry default for %s into the shared contract owner",
    (capability, dossierId, providerKey) => {
      const plan = buildDossierIntegrationPlan({
        contracts: { dataMode: "persisted", integrations: [], envVars: [] },
        dossierSelection: selectDossiersForRequest({ requestedCapabilities: [capability] }),
        projectFiles: [],
      });
      expect(plan.dossierSelection.selected.map((item) => item.entry.id)).toEqual([dossierId]);
      expect(plan.contracts.integrations).toContainEqual(
        expect.objectContaining({
          providerKey,
          dossierCapability: capability,
          selectionSource: "dossier-default",
        }),
      );
    },
  );

  it("keeps a soft dossier without inventing a provider contract", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["carousel"] });
    expect(selection.selected[0]?.entry.providers).toBeUndefined();
    const plan = buildDossierIntegrationPlan({
      contracts: { dataMode: "none", integrations: [], envVars: [] },
      dossierSelection: selection,
      projectFiles: [],
    });
    expect(plan.dossierSelection.selected).toHaveLength(1);
    expect(plan.contracts.integrations).toEqual([]);
  });

  it("lets actual project evidence outrank a registry default when no snapshot contract exists", () => {
    const plan = buildDossierIntegrationPlan({
      contracts: { dataMode: "persisted", integrations: [], envVars: [] },
      dossierSelection: selectDossiersForRequest({ requestedCapabilities: ["auth"] }),
      projectFiles: [],
      projectProviderEvidence: [
        { kind: "auth", providerKey: "next-auth", dossierCapability: "auth", packageRoot: "next-auth" },
      ],
    });

    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "next-auth", dossierCapability: "auth" }),
    );
    expect(plan.decisions[0]).toMatchObject({
      disposition: "context-only",
      reasonCode: "dossierless-provider",
    });
  });

  it("blocks an occupied server/verbatim output before dossier materialization", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["payments"] });
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "payment",
        providerKey: "stripe",
        dossierCapability: "payments",
        selectionSource: "explicit",
        provider: "Stripe",
        name: "Stripe",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: [
        { path: "app/api/checkout-session/route.ts", content: "export async function POST() {}" },
      ],
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "blocked",
      reasonCode: "owned-path-conflict",
    });
  });

  it("does not treat a complete filename set with divergent bytes as installed dossier core", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["payments"] });
    const selected = selection.selected[0];
    expect(selected?.entry.id).toBe("stripe-checkout");
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "payment",
        providerKey: "stripe",
        dossierCapability: "payments",
        selectionSource: "explicit",
        provider: "Stripe",
        name: "Stripe",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: (selected?.entry.files ?? []).map((file) => ({
        path: resolveDossierFilePath(file.path).outputPath,
        content: "// unrelated project-owned implementation",
      })),
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "blocked",
      reasonCode: "owned-path-conflict",
    });
  });

  it("allows a partial canonical core so missing files can be installed", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["payments"] });
    const selected = selection.selected[0]!;
    const ownedFile = (selected.entry.files ?? []).find(
      (file) => file.role === "server" || file.injectionMode === "verbatim",
    )!;
    const canonical = getDossierFileContent(
      selected.entry.class,
      selected.entry.id,
      ownedFile.path,
    );
    expect(canonical).not.toBeNull();
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "payment",
        providerKey: "stripe",
        dossierCapability: "payments",
        selectionSource: "explicit",
        provider: "Stripe",
        name: "Stripe",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: [
        { path: resolveDossierFilePath(ownedFile.path).outputPath, content: canonical! },
      ],
    });
    expect(plan.dossierSelection.selected.map((item) => item.entry.id)).toEqual([
      "stripe-checkout",
    ]);
  });

  it("allows a rewritable UI path to be adapted", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["ai-chat"] });
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "integration",
        providerKey: "openai",
        dossierCapability: "ai-chat",
        selectionSource: "explicit",
        provider: "OpenAI",
        name: "OpenAI",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: [{ path: "components/chat-panel.tsx", content: "export function ChatPanel() {}" }],
    });
    expect(plan.dossierSelection.selected.map((item) => item.entry.id)).toEqual(["openai-chat"]);
  });

  it.each(["@stripe/react-stripe-js", "@stripe/stripe-js"])(
    "keeps hosted checkout context-only when %s proves an existing Elements method",
    (packageRoot) => {
      const plan = buildDossierIntegrationPlan({
        contracts: contracts({
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          selectionSource: "explicit",
          provider: "Stripe",
          name: "Stripe",
          reason: "Explicit provider contract",
          status: "chosen",
        }),
        dossierSelection: selectDossiersForRequest({ requestedCapabilities: ["payments"] }),
        projectFiles: [],
        projectProviderEvidence: [
          { kind: "payment", providerKey: "stripe-elements", packageRoot },
        ],
      });
      expect(plan.dossierSelection.selected).toEqual([]);
      expect(plan.decisions[0]).toMatchObject({
        disposition: "context-only",
        reasonCode: "method-incompatible",
        providerKey: "stripe-elements",
      });
    },
  );

  it("does not let a wrong-provider Clerk path block an Auth0 context-only decision", () => {
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "auth",
        providerKey: "auth0",
        dossierCapability: "auth",
        selectionSource: "explicit",
        provider: "Auth0",
        name: "Auth0",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selectDossiersForRequest({ requestedCapabilities: ["auth"] }),
      projectFiles: [
        { path: "middleware.ts", content: "export const middleware = auth0Middleware;" },
      ],
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "context-only",
      reasonCode: "dossierless-provider",
      providerKey: "auth0",
    });
  });

  it("does not let a Drizzle-owned path outrank an explicit Prisma method", () => {
    const plan = buildDossierIntegrationPlan({
      contracts: {
        dataMode: "persisted",
        envVars: [],
        integrations: [
          {
            kind: "database",
            providerKey: "postgres",
            dossierCapability: "database",
            selectionSource: "explicit",
            provider: "Postgres / DATABASE_URL",
            name: "Postgres",
            reason: "Explicit provider contract",
            status: "chosen",
          },
          {
            kind: "database",
            providerKey: "prisma",
            selectionSource: "explicit",
            provider: "Prisma",
            name: "Prisma",
            reason: "Explicit method",
            status: "chosen",
          },
        ],
      },
      dossierSelection: selectDossiersForRequest({ requestedCapabilities: ["database"] }),
      projectFiles: [
        { path: "lib/db/index.ts", content: "export const db = prismaClient;" },
      ],
    });
    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "context-only",
      reasonCode: "method-incompatible",
      providerKey: "prisma",
    });
  });
});
