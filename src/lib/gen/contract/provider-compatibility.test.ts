import { describe, expect, it } from "vitest";
import { getPreGenerationContractsConfigFromManifest } from "@/lib/ai-models/load-manifest";
import { selectDossiersForRequest } from "../dossiers/select";
import { resolveDossierFilePath } from "../dossiers/output-path";
import { getDossierById, getDossierFileContent } from "../dossiers/registry";
import type { PlanContracts } from "../plan/schema";
import { detectProjectProviderEvidence } from "./project-provider-evidence";
import {
  buildDossierIntegrationPlan,
  resolveExistingDossierCorePlan,
} from "./provider-compatibility";

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

  it("keeps proven older Clerk core as context instead of replacing it from the catalog", () => {
    const selection = selectDossiersForRequest({ requestedCapabilities: ["auth"] });
    const plan = buildDossierIntegrationPlan({
      contracts: contracts({
        kind: "auth",
        providerKey: "clerk",
        dossierCapability: "auth",
        selectionSource: "explicit",
        provider: "Clerk",
        name: "Clerk",
        reason: "Explicit provider contract",
        status: "chosen",
      }),
      dossierSelection: selection,
      projectFiles: [
        {
          path: "middleware.ts",
          content: 'import { clerkMiddleware } from "@clerk/nextjs/server"; // older bytes',
        },
        { path: "components/auth-buttons.tsx", content: "older auth buttons" },
        { path: "components/clerk-provider-shell.tsx", content: "older provider shell" },
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { "@clerk/nextjs": "^6.0.0" } }),
        },
      ],
      projectProviderEvidence: [
        {
          kind: "auth",
          providerKey: "clerk",
          dossierCapability: "auth",
          packageRoot: "@clerk/nextjs",
        },
      ],
    });

    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "context-only",
      reasonCode: "existing-provider-core",
    });
  });

  it("requires an explicit migration when proven Clerk core meets a Supabase auth choice", () => {
    const selection = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "Use Supabase auth",
    });
    expect(selection.selected[0]?.entry.id).toBe("supabase-auth");
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
      projectFiles: [
        {
          path: "middleware.ts",
          content: 'import { clerkMiddleware } from "@clerk/nextjs/server"; // older bytes',
        },
        { path: "components/auth-buttons.tsx", content: "older auth buttons" },
        { path: "components/clerk-provider-shell.tsx", content: "older provider shell" },
      ],
      projectProviderEvidence: [
        {
          kind: "auth",
          providerKey: "clerk",
          dossierCapability: "auth",
          packageRoot: "@clerk/nextjs",
        },
      ],
    });

    expect(plan.dossierSelection.selected).toEqual([]);
    expect(plan.decisions[0]).toMatchObject({
      disposition: "blocked",
      reasonCode: "owned-path-conflict",
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

describe("resolveExistingDossierCorePlan", () => {
  function dossierFiles(id: string, mode: "canonical" | "divergent") {
    const entry = getDossierById(id);
    expect(entry).not.toBeNull();
    return (entry?.files ?? []).map((file) => ({
      path: resolveDossierFilePath(file.path).outputPath,
      content:
        mode === "canonical"
          ? getDossierFileContent(entry!.class, entry!.id, file.path)!
          : `older project bytes for ${file.path}`,
    }));
  }

  const olderClerkFiles = [
    {
      path: "middleware.ts",
      content: 'import { clerkMiddleware } from "@clerk/nextjs/server"; // older bytes',
    },
    { path: "components/auth-buttons.tsx", content: "older auth buttons" },
    { path: "components/clerk-provider-shell.tsx", content: "older provider shell" },
    {
      path: "package.json",
      content: JSON.stringify({ dependencies: { "@clerk/nextjs": "^6.0.0" } }),
    },
  ];
  const clerkEvidence = [
    {
      kind: "auth" as const,
      providerKey: "clerk",
      dossierCapability: "auth",
      packageRoot: "@clerk/nextjs",
    },
  ];

  it("preserves divergent OpenAI dossier core proven by its shipped SDK package", () => {
    const projectFiles = [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { "@ai-sdk/openai": "^3" } }),
      },
      {
        path: "app/api/chat/route.ts",
        content:
          'import { openai } from "@ai-sdk/openai"; export const POST = () => openai("gpt"); // older divergent bytes',
      },
      {
        path: "components/chat-panel.tsx",
        content: "export function ChatPanel() { return null; } // older divergent bytes",
      },
    ];
    const projectProviderEvidence = detectProjectProviderEvidence(
      projectFiles,
      getPreGenerationContractsConfigFromManifest().providerRules,
    );
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          provider: "Stripe",
          name: "Stripe",
          reason: "Unrelated payment follow-up",
          status: "chosen",
        },
      ],
      projectFiles,
      projectProviderEvidence,
    });

    expect(projectProviderEvidence).toContainEqual(
      expect.objectContaining({
        providerKey: "openai",
        dossierCapability: "ai-chat",
        packageRoot: "@ai-sdk/openai",
      }),
    );
    expect(result.preservedDossiers.map((dossier) => dossier.id)).toContain("openai-chat");
    expect(result.migrationRequired).toBe(false);
  });

  it("preserves divergent Cal.com core proven by its shipped embed package", () => {
    const projectFiles = [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { "@calcom/embed-react": "^1" } }),
      },
      {
        path: "components/booking-calendar.tsx",
        content:
          'import Cal from "@calcom/embed-react"; export function BookingCalendar() { return <Cal calLink="older/core" />; }',
      },
    ];
    const projectProviderEvidence = detectProjectProviderEvidence(
      projectFiles,
      getPreGenerationContractsConfigFromManifest().providerRules,
    );
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          provider: "Stripe",
          name: "Stripe",
          reason: "Unrelated payment follow-up",
          status: "chosen",
        },
      ],
      projectFiles,
      projectProviderEvidence,
    });

    expect(projectProviderEvidence).toContainEqual(
      expect.objectContaining({
        providerKey: "calcom",
        dossierCapability: "booking",
        packageRoot: "@calcom/embed-react",
      }),
    );
    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual([
      "calcom-booking",
    ]);
    expect(result.migrationRequired).toBe(false);
  });

  it("preserves proven old Clerk during an unrelated Stripe-only follow-up", () => {
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          provider: "Stripe",
          name: "Stripe",
          reason: "Current payment follow-up",
          status: "chosen",
        },
      ],
      projectFiles: olderClerkFiles,
      projectProviderEvidence: clerkEvidence,
    });
    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual(["clerk-auth"]);
    expect(result.migrationRequired).toBe(false);
  });

  it("preserves proven canonical Clerk during an unrelated Stripe-only follow-up", () => {
    const clerk = selectDossiersForRequest({ requestedCapabilities: ["auth"] }).selected[0]!.entry;
    const canonicalFiles = (clerk.files ?? []).map((file) => ({
      path: resolveDossierFilePath(file.path).outputPath,
      content: getDossierFileContent(clerk.class, clerk.id, file.path)!,
    }));
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          provider: "Stripe",
          name: "Stripe",
          reason: "Current payment follow-up",
          status: "chosen",
        },
      ],
      projectFiles: canonicalFiles,
      projectProviderEvidence: clerkEvidence,
    });
    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual(["clerk-auth"]);
    expect(result.migrationRequired).toBe(false);
  });

  it("holds actual dossierless Auth0 evidence when the current target is Clerk", () => {
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "auth",
          providerKey: "clerk",
          dossierCapability: "auth",
          provider: "Clerk",
          name: "Clerk",
          reason: "Current auth target",
          status: "chosen",
        },
      ],
      projectFiles: [
        {
          path: "lib/auth0.ts",
          content: 'import { Auth0Client } from "@auth0/nextjs-auth0/server";',
        },
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { "@auth0/nextjs-auth0": "^4" } }),
        },
      ],
      projectProviderEvidence: [
        {
          kind: "auth",
          providerKey: "auth0",
          dossierCapability: "auth",
          packageRoot: "@auth0/nextjs-auth0",
        },
      ],
    });
    expect(result.migrationRequired).toBe(true);
  });

  it("holds and preserves multiple proven existing auth providers without a current auth target", () => {
    const clerk = selectDossiersForRequest({ requestedCapabilities: ["auth"] }).selected[0]!.entry;
    const supabase = selectDossiersForRequest({
      requestedCapabilities: ["auth"],
      promptText: "Supabase auth",
    }).selected[0]!.entry;
    const paths = new Set<string>();
    const projectFiles = [...(clerk.files ?? []), ...(supabase.files ?? [])].flatMap((file) => {
      const path = resolveDossierFilePath(file.path).outputPath;
      if (paths.has(path)) return [];
      paths.add(path);
      return [{ path, content: `older bytes for ${path}` }];
    });
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "payment",
          providerKey: "stripe",
          dossierCapability: "payments",
          provider: "Stripe",
          name: "Stripe",
          reason: "Unrelated current target",
          status: "chosen",
        },
      ],
      projectFiles,
      projectProviderEvidence: [
        ...clerkEvidence,
        {
          kind: "auth",
          providerKey: "supabase",
          dossierCapability: "auth",
          packageRoot: "@supabase/ssr",
        },
      ],
    });
    expect(result.migrationRequired).toBe(true);
    expect(result.preservedDossiers.map((dossier) => dossier.id).sort()).toEqual([
      "clerk-auth",
      "supabase-auth",
    ]);
  });

  it("lets explicit removal win over preservation", () => {
    const result = resolveExistingDossierCorePlan({
      contracts: [],
      projectFiles: olderClerkFiles,
      projectProviderEvidence: clerkEvidence,
      removedDossierIds: new Set(["clerk-auth"]),
    });
    expect(result.preservedDossiers).toEqual([]);
  });

  it("preserves the existing foreign-provider hold for exact canonical hard core", () => {
    const clerk = selectDossiersForRequest({ requestedCapabilities: ["auth"] }).selected[0]!.entry;
    const canonicalFiles = (clerk.files ?? []).map((file) => ({
      path: resolveDossierFilePath(file.path).outputPath,
      content: getDossierFileContent(clerk.class, clerk.id, file.path)!,
    }));
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "auth",
          providerKey: "auth0",
          dossierCapability: "auth",
          provider: "Auth0",
          name: "Auth0",
          reason: "Current provider intent",
          status: "chosen",
        },
      ],
      projectFiles: canonicalFiles,
      projectProviderEvidence: [],
    });
    expect(result.migrationRequired).toBe(true);
    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual(["clerk-auth"]);
  });

  it.each(["mailchimp-newsletter", "visitor-counter"])(
    "preserves canonical REST core without claiming provider evidence: %s",
    (dossierId) => {
      const result = resolveExistingDossierCorePlan({
        contracts: [
          {
            kind: "payment",
            providerKey: "stripe",
            dossierCapability: "payments",
            provider: "Stripe",
            name: "Stripe",
            reason: "Unrelated follow-up",
            status: "chosen",
          },
        ],
        projectFiles: dossierFiles(dossierId, "canonical"),
        projectProviderEvidence: [],
      });

      expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual([dossierId]);
      expect(result.migrationRequired).toBe(false);
    },
  );

  it.each(["mailchimp-newsletter", "visitor-counter"])(
    "holds and preserves divergent REST core whose provider cannot be proven: %s",
    (dossierId) => {
      const result = resolveExistingDossierCorePlan({
        contracts: [
          {
            kind: "payment",
            providerKey: "stripe",
            dossierCapability: "payments",
            provider: "Stripe",
            name: "Stripe",
            reason: "Unrelated follow-up",
            status: "chosen",
          },
        ],
        projectFiles: dossierFiles(dossierId, "divergent"),
        projectProviderEvidence: [],
      });

      expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual([dossierId]);
      expect(result.migrationRequired).toBe(true);
      expect(result.decisions).toContainEqual(
        expect.objectContaining({
          dossierId,
          disposition: "blocked",
          reasonCode: "owned-path-conflict",
        }),
      );
    },
  );

  it("holds divergent REST core even when the current capability contract is unresolved", () => {
    const dossierId = "mailchimp-newsletter";
    const result = resolveExistingDossierCorePlan({
      contracts: [
        {
          kind: "integration",
          dossierCapability: "newsletter-subscribe",
          provider: "Newsletter provider not selected",
          name: "Newsletter provider not selected",
          reason: "Provider choice is unresolved",
          status: "unresolved",
        },
      ],
      projectFiles: dossierFiles(dossierId, "divergent"),
      projectProviderEvidence: [],
    });

    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual([dossierId]);
    expect(result.migrationRequired).toBe(true);
  });

  it("does not seed or preserve a REST dossier when only its rewritable UI file exists", () => {
    const result = resolveExistingDossierCorePlan({
      contracts: [],
      projectFiles: [
        {
          path: "components/newsletter-form.tsx",
          content: "export function NewsletterForm() { return null; }",
        },
      ],
      projectProviderEvidence: [],
    });

    expect(result.preservedDossiers).toEqual([]);
    expect(result.migrationRequired).toBe(false);
  });

  it("does not extend hard-provider preservation fallback to soft verbatim code", () => {
    const result = resolveExistingDossierCorePlan({
      contracts: [],
      projectFiles: dossierFiles("local-site-search", "divergent"),
      projectProviderEvidence: [],
    });

    expect(result.preservedDossiers).toEqual([]);
    expect(result.migrationRequired).toBe(false);
  });

  it("lets explicit REST dossier removal win over canonical-byte preservation", () => {
    const dossierId = "mailchimp-newsletter";
    const result = resolveExistingDossierCorePlan({
      contracts: [],
      projectFiles: dossierFiles(dossierId, "canonical"),
      projectProviderEvidence: [],
      removedDossierIds: new Set([dossierId]),
    });

    expect(result.preservedDossiers).toEqual([]);
    expect(result.migrationRequired).toBe(false);
  });
});
