import { describe, it, expect, vi } from "vitest";
import { deriveBuildSpec } from "@/lib/gen/build-spec";
import { buildOrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { GenerationFinalizeInput } from "@/lib/gen/generation-input-package";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { getDossierById } from "@/lib/gen/dossiers/registry";
import * as prePhases from "./pre-phases";
import * as fastPath from "./fast-path";

// Mocka DB-klienten innan runner.ts laddas — annars kraschar modulladdningen
// med "Missing database connection string" eftersom runner.ts transitive
// importerar chat-repository-pg → db/client.ts. Den helper vi testar
// (resolveSelectedDossiersFromStreamMeta) använder INTE DB:n alls; det är
// bara import-grafens sidoeffekt vi behöver hantera.
vi.mock("@/lib/db/client", () => ({
  getDb: () => {
    throw new Error("getDb() not used in dossier-threading tests");
  },
  isBuildPhase: () => true,
}));

const {
  finalizeAndSaveVersion,
  resolveFinalizeDossierContext,
  resolveExistingDossierCoreFromStreamMeta,
  resolveRemovedDossiersFromStreamMeta,
  resolveSelectedDossiersFromStreamMeta,
} = await import("./runner");
const { mergeGeneratedProjectFiles } = await import("../finalize-merge");

function decidedInput(overrides: Partial<GenerationFinalizeInput> = {}): GenerationFinalizeInput {
  const routePlan: RoutePlan = {
    provenance: { primarySource: "prompt", sources: ["prompt"] },
    siteType: "one-page",
    reason: "explicit empty route plan",
    routes: [],
  };
  const preGenerationContracts = {
    contracts: { dataMode: "none" as const, integrations: [], envVars: [] },
    unresolvedDecisions: [],
  };
  const buildSpec = deriveBuildSpec({
    prompt: "Bygg sidan",
    buildIntent: "website",
    generationMode: "init",
    resolvedScaffold: null,
    routePlan,
    preGenerationContracts,
  });
  return {
    buildSpec,
    routePlan,
    orchestrationContract: buildOrchestrationContract({
      buildSpec,
      routePlan,
      resolvedScaffold: null,
    }),
    resolvedScaffold: null,
    lineageHash: "decided-lineage",
    variantId: null,
    dossierSelection: { selected: [], poolSize: 0, byCapability: {} },
    preGenerationContracts,
    removedCapabilities: [],
    removedDossierIds: [],
    ...overrides,
  };
}

describe("decided generation input → finalize", () => {
  it("uses the exact selected entries despite malformed or conflicting metadata", () => {
    const entry = { ...getDossierById("stripe-checkout")!, label: "Decided Stripe" };
    const input = decidedInput({
      dossierSelection: {
        selected: [{ entry, reason: "capability-match", configured: false }],
        poolSize: 1,
        byCapability: { payments: [entry.id] },
      },
    });
    const result = resolveFinalizeDossierContext(
      { selectedDossierIds: null, requestedCapabilities: ["auth"], removedCapabilities: ["payments"] },
      input,
    );
    expect(result.selectedDossiers[0]).toBe(entry);
    expect(result.selectedDossierIds).toEqual(["stripe-checkout"]);
    expect(result.requestedCapabilities).toEqual(["payments"]);
  });

  it.each([undefined, null, { selected: [], poolSize: 0, byCapability: {} }])(
    "does not select from metadata when the modern selection is %j",
    (dossierSelection) => {
      const result = resolveFinalizeDossierContext(
        { selectedDossierIds: ["stripe-checkout"], requestedCapabilities: ["payments"] },
        decidedInput({ dossierSelection }),
      );
      expect(result).toEqual({ selectedDossiers: [], selectedDossierIds: [], requestedCapabilities: [] });
    },
  );

  it("keeps decided removals separate from stale metadata and treats [] as authoritative", () => {
    const previousFiles = [
      { path: "components/checkout-button.tsx" },
      { path: "app/api/checkout-session/route.ts" },
      { path: "components/integration-config-notice.tsx" },
    ];
    const meta = { removedCapabilities: ["auth"], removedDossierIds: ["clerk-auth"] };
    const input = decidedInput({ removedCapabilities: ["payments"], removedDossierIds: ["stripe-checkout"] });
    expect(resolveRemovedDossiersFromStreamMeta(meta, previousFiles, input).map((d) => d.id))
      .toEqual(["stripe-checkout"]);
    expect(resolveRemovedDossiersFromStreamMeta(meta, previousFiles, { ...input, removedDossierIds: [] }))
      .toEqual([]);
    expect(resolveRemovedDossiersFromStreamMeta(meta, previousFiles, decidedInput({ removedCapabilities: undefined })))
      .toEqual([]);
  });

  it.each(["chosen-variant", null])(
    "threads variant %j, empty routes and scaffold-less input into the real runner",
    async (variantId) => {
      const input = decidedInput({ variantId });
      const stop = new Error("captured before project checks and persistence");
      const autofix = vi.spyOn(prePhases, "runAutofixPrePhase");
      const prepare = vi.spyOn(fastPath, "runFinalizeFastPath").mockRejectedValueOnce(stop);
      try {
        await expect(finalizeAndSaveVersion({
          accumulatedContent: "<main>Generated</main>",
          chatId: "decided-input",
          model: "gpt-5.4",
          resolvedScaffold: null,
          urlMap: {},
          startedAt: Date.now(),
          runAutofix: false,
          generationInput: input,
          routePlan: { ...input.routePlan, routes: [{ path: "/stale", name: "Old", intent: "old", required: true }] },
          orchestrationStreamMeta: { selectedDossierIds: ["stripe-checkout"], variantId: "stale-variant" },
        })).rejects.toBe(stop);
        expect(autofix).toHaveBeenCalledWith(expect.objectContaining({ variantId, selectedDossierIds: [] }));
        const call = prepare.mock.calls.at(-1)?.[0];
        expect(call?.routePlan).toBe(input.routePlan);
        expect(call?.orchestrationContract).toBe(input.orchestrationContract);
        expect(call?.buildSpec).toBe(input.buildSpec);
        expect(call?.resolvedScaffold).toBeNull();
        expect(call?.selectedDossiers).toEqual([]);
        expect(call?.repairScopeId).toBe("decided-lineage:root");
      } finally {
        autofix.mockRestore();
        prepare.mockRestore();
      }
    },
  );
});

/**
 * Regressionstest för Wave 6 verbatim-policy:
 *
 * Bevisar att `resolveSelectedDossiersFromStreamMeta` faktiskt löser fram
 * dossier-entries från orchestrationStreamMeta. Detta är pricken över i:et
 * för spår 4 (dossier hard/soft enforcement) — utan denna trådning körs
 * `applyDossierVerbatimPolicy` med tom array och verbatim-restore blir
 * de facto avstängd i produktion (vilket var review-fyndet i c538d89a0).
 */
describe("resolveSelectedDossiersFromStreamMeta — orchestration → finalize trådning", () => {
  it("returnerar tom array när capabilities saknas i streamMeta", () => {
    expect(resolveSelectedDossiersFromStreamMeta(null)).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta(undefined)).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta({})).toEqual([]);
    expect(resolveSelectedDossiersFromStreamMeta({ capabilities: {} })).toEqual([]);
  });

  it("föredrar explicit selectedDossierIds från orchestration framför capability-replay", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      selectedDossierIds: ["stripe-checkout"],
      requestedCapabilities: ["visual-3d"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("stripe-checkout");
    expect(result[0]?.capability).toBe("payments");
  });

  it("treats an explicitly empty dossier selection as authoritative", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      selectedDossierIds: [],
      requestedCapabilities: ["booking"],
      briefSummary: { requestedCapabilities: ["booking"] },
    });
    expect(result).toEqual([]);
  });

  it("does not replay capability defaults for valid unknown or partially known explicit ids", () => {
    expect(
      resolveSelectedDossiersFromStreamMeta({
        selectedDossierIds: ["dossier-that-does-not-exist"],
        requestedCapabilities: ["auth"],
      }),
    ).toEqual([]);
    expect(
      resolveSelectedDossiersFromStreamMeta({
        selectedDossierIds: ["supabase-auth", "dossier-that-does-not-exist"],
        requestedCapabilities: ["auth", "payments"],
      }).map((entry) => entry.id),
    ).toEqual(["supabase-auth"]);
  });

  it("keeps removed capabilities out of an authoritative explicit selection", () => {
    expect(
      resolveSelectedDossiersFromStreamMeta({
        selectedDossierIds: ["stripe-checkout"],
        requestedCapabilities: ["payments"],
        removedCapabilities: ["payments"],
      }),
    ).toEqual([]);
  });

  it.each([null, { id: "clerk-auth" }, ["clerk-auth", 7]])(
    "fails closed for malformed present selectedDossierIds metadata: %j",
    (selectedDossierIds) => {
      expect(() =>
        resolveSelectedDossiersFromStreamMeta({
          selectedDossierIds,
          requestedCapabilities: ["auth"],
        }),
      ).toThrow("selectedDossierIds");
    },
  );

  it("derives autofix inputs from explicit entries only and preserves absent legacy fallback", () => {
    expect(
      resolveFinalizeDossierContext({
        selectedDossierIds: ["supabase-auth", "dossier-that-does-not-exist"],
        requestedCapabilities: ["auth", "payments"],
      }),
    ).toMatchObject({
      selectedDossierIds: ["supabase-auth"],
      requestedCapabilities: ["auth"],
    });
    expect(
      resolveFinalizeDossierContext({
        selectedDossierIds: [],
        requestedCapabilities: ["auth"],
      }),
    ).toMatchObject({ selectedDossierIds: [], requestedCapabilities: [] });
    expect(
      resolveFinalizeDossierContext({ requestedCapabilities: ["auth"] }),
    ).toMatchObject({ selectedDossierIds: undefined, requestedCapabilities: ["auth"] });
  });

  it("faller tillbaka till requestedCapabilities när selectedDossierIds saknas", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["visual-3d"],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("returnerar dossier entries när requestedCapabilities matchar visual-3d", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["visual-3d"],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
    expect(result[0]?.class).toBe("soft");
    expect(result[0]?.codeFidelity).toBe("rewritable");
  });

  it("härleder visual-3d från capabilities.needs3D=true (legacy-format)", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      capabilities: { needs3D: true },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("läser även från briefSummary.requestedCapabilities", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      briefSummary: {
        requestedCapabilities: ["visual-3d"],
      },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("mergar top-level och briefSummary capabilities för legacy-replay", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["visual-3d"],
      briefSummary: {
        requestedCapabilities: ["payments"],
      },
    });
    const ids = result.map((entry) => entry.id);
    expect(ids).toContain("three-fiber-canvas");
    expect(ids).toContain("stripe-checkout");
  });

  it("låter removedCapabilities vinna över stale explicit ids och brief replay", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      selectedDossierIds: ["stripe-checkout"],
      requestedCapabilities: [],
      removedCapabilities: ["payments"],
      briefSummary: {
        requestedCapabilities: ["payments"],
      },
    });
    expect(result).toEqual([]);
  });

  it("ignorerar tomma/whitespace strings i requestedCapabilities", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["", "   ", "visual-3d", ""],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("three-fiber-canvas");
  });

  it("returnerar tom array för okänd capability", () => {
    const result = resolveSelectedDossiersFromStreamMeta({
      requestedCapabilities: ["nonexistent-capability-xyz"],
    });
    expect(result).toEqual([]);
  });
});

describe("resolveRemovedDossiersFromStreamMeta", () => {
  it("resolves explicit removed dossier ids from orchestration", () => {
    const result = resolveRemovedDossiersFromStreamMeta(
      {
        removedCapabilities: ["payments"],
        removedDossierIds: ["stripe-checkout"],
      },
      [],
    );
    expect(result.map((entry) => entry.id)).toEqual(["stripe-checkout"]);
  });

  it("falls back to previous-file evidence when ids are unavailable", () => {
    const result = resolveRemovedDossiersFromStreamMeta(
      { removedCapabilities: ["payments"] },
      [
        { path: "components/checkout-button.tsx" },
        { path: "app/api/checkout-session/route.ts" },
        { path: "components/integration-config-notice.tsx" },
      ],
    );
    expect(result.map((entry) => entry.id)).toEqual(["stripe-checkout"]);
  });
});

describe("resolveExistingDossierCoreFromStreamMeta", () => {
  it("preserves proven old Clerk on a Stripe-only follow-up without inherited auth metadata", () => {
    const result = resolveExistingDossierCoreFromStreamMeta(
      {
        selectedDossierIds: ["stripe-checkout"],
        contractIntegrations: [
          {
            kind: "payment",
            providerKey: "stripe",
            dossierCapability: "payments",
            provider: "Stripe",
            name: "Stripe",
            reason: "Payment follow-up",
            status: "chosen",
          },
        ],
      },
      [
        {
          path: "middleware.ts",
          content: 'import { clerkMiddleware } from "@clerk/nextjs/server"; // older bytes',
        },
        { path: "components/auth-buttons.tsx", content: "older buttons" },
        { path: "components/clerk-provider-shell.tsx", content: "older shell" },
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { "@clerk/nextjs": "^6.0.0" } }),
        },
      ],
    );

    expect(result.preservedDossiers.map((dossier) => dossier.id)).toEqual(["clerk-auth"]);
    expect(result.migrationRequired).toBe(false);
  });

  it("preserves divergent existing Clerk bytes without re-selecting Clerk from an explicit empty list", () => {
    const streamMeta = {
      selectedDossierIds: [],
      requestedCapabilities: ["auth"],
      contractIntegrations: [
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
    };
    const previousFiles = [
      {
        path: "middleware.ts",
        content: 'import { clerkMiddleware } from "@clerk/nextjs/server"; // older bytes',
        language: "ts" as const,
      },
      {
        path: "components/auth-buttons.tsx",
        content: "export const AuthButtons = () => null; // older bytes",
        language: "tsx" as const,
      },
      {
        path: "components/clerk-provider-shell.tsx",
        content: "export const ClerkProviderShell = () => null; // older bytes",
        language: "tsx" as const,
      },
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { "@clerk/nextjs": "^6.0.0" } }),
        language: "json" as const,
      },
    ];
    const selectedDossiers = resolveSelectedDossiersFromStreamMeta(streamMeta);
    const existingCore = resolveExistingDossierCoreFromStreamMeta(streamMeta, previousFiles);
    const generatedFiles = [
      {
        path: "middleware.ts",
        content: "export const middleware = 'rewritten';",
        language: "ts" as const,
      },
      {
        path: "app/page.tsx",
        content: "export default function Page() { return null; }",
        language: "tsx" as const,
      },
    ];
    const result = mergeGeneratedProjectFiles({
      chatId: "authoritative-empty-selection",
      originalFilesJson: JSON.stringify(generatedFiles),
      generatedFiles,
      resolvedScaffold: null,
      previousFiles,
      selectedDossiers,
      preservedDossiers: existingCore.preservedDossiers,
    });
    const merged = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;

    expect(selectedDossiers).toEqual([]);
    expect(existingCore.preservedDossiers.map((dossier) => dossier.id)).toEqual(["clerk-auth"]);
    expect(merged.find((file) => file.path === "middleware.ts")?.content).toContain(
      "older bytes",
    );
    expect(merged.filter((file) => file.path === "middleware.ts")).toHaveLength(1);
  });
});
