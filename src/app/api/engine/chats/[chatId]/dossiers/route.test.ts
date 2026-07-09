import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectedDossier } from "@/lib/gen/dossiers/types";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const resolveSelectedDossiersFromSnapshot = vi.hoisted(() => vi.fn());
const selectDossiersForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const resolveDossiersPresentInVersion = vi.hoisted(() => vi.fn());
const extractBriefSummaryFromSnapshot = vi.hoisted(() => vi.fn());
const deriveTier3BuildSpecForVersion = vi.hoisted(() => vi.fn());
const validateTier3Readiness = vi.hoisted(() => vi.fn());
const mapProviderKeysToDossierCapabilities = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _endpoint: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion,
  getPreferredVersion,
}));

vi.mock("@/lib/gen/dossiers/snapshot-selection", () => ({
  resolveSelectedDossiersFromSnapshot,
}));

vi.mock("@/lib/gen/dossiers/select", () => ({
  selectDossiersForRequest,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/gen/dossiers/version-presence", () => ({
  resolveDossiersPresentInVersion,
}));

vi.mock("@/lib/gen/orchestration-snapshot", () => ({
  extractBriefSummaryFromSnapshot,
}));

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  deriveTier3BuildSpecForVersion,
}));

vi.mock("@/lib/integrations/tier3-build-spec", () => ({
  validateTier3Readiness,
  mapProviderKeysToDossierCapabilities,
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));

vi.mock("@/lib/gen/preview/env-local", () => ({
  loadPlaceholderKeySet,
}));

import { GET } from "./route";
import type { DossierOverviewResponse } from "@/lib/builder/dossier-overview";

function request(versionId?: string) {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return new Request(`http://localhost/api/engine/chats/chat_1/dossiers${query}`);
}

const ctx = { params: Promise.resolve({ chatId: "chat_1" }) };

function softDossier(): SelectedDossier {
  return {
    entry: {
      class: "soft",
      id: "faq-accordion",
      label: "FAQ Accordion",
      capability: "faq-section",
      codeFidelity: "rewritable",
      complexity: "simple",
      defaultForCapability: true,
      summary: "Self-contained FAQ accordion section using theme tokens.",
      envVars: [],
      dependencies: [],
      files: [{ path: "components/faq-accordion.tsx", role: "client" }],
      lastVerified: "2026-06-25",
    },
    reason: "capability-match",
    configured: true,
  };
}

function stripeDossier(): SelectedDossier {
  return {
    entry: {
      class: "hard",
      id: "stripe-checkout",
      label: "Stripe Checkout",
      capability: "payments",
      codeFidelity: "verbatim",
      complexity: "medium",
      defaultForCapability: true,
      summary: "Hosted Stripe Checkout for one-time and subscription payments.",
      envVars: [
        {
          key: "STRIPE_SECRET_KEY",
          required: true,
          enforcement: "build",
          purpose: "Server-side Stripe API authentication.",
        },
      ],
      dependencies: ["stripe", "@stripe/stripe-js"],
      files: [{ path: "components/api/checkout-session/route.ts", role: "server" }],
      lastVerified: "2026-04-20",
    },
    reason: "capability-match",
    configured: false,
  };
}

function aiToolCallingDossier(): SelectedDossier {
  return {
    entry: {
      class: "hard",
      id: "ai-tool-calling-chat",
      label: "AI Tool-Calling Chat Route",
      capability: "ai-tool-calling",
      codeFidelity: "rewritable",
      complexity: "medium",
      defaultForCapability: true,
      summary: "Streamed chat endpoint with server-side tool calling.",
      envVars: [
        {
          key: "OPENAI_API_KEY",
          required: true,
          enforcement: "feature-runtime",
          purpose: "OpenAI provider auth.",
        },
      ],
      dependencies: ["@ai-sdk/openai", "ai", "zod"],
      files: [{ path: "components/api/assistant/route.ts", role: "server" }],
      lastVerified: "2026-04-17",
    },
    reason: "capability-match",
    configured: false,
  };
}

const stripeRequirement = {
  key: "stripe",
  name: "Stripe",
  provider: "stripe",
  requiredRealEnvKeys: ["STRIPE_SECRET_KEY"],
  placeholderOkEnvKeys: [],
  featureRuntimeEnvKeys: [],
  warnOnlyEnvKeys: [],
  buildInstructions: [],
  setupGuide: "",
  hasConfigNoticeComponent: true,
};

describe("GET dossiers overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      orchestration_snapshot: { requestedCapabilities: ["payments", "faq-section"] },
    });
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
    });
    getLatestVersion.mockResolvedValue(null);
    getStoredProjectEnvVarMap.mockResolvedValue({});
    readAllowPlaceholdersInF3.mockResolvedValue(false);
    loadPlaceholderKeySet.mockReturnValue(new Set<string>());
    // Reconciliation sources (F2-mute capability-loss fix) default to "no
    // extra capabilities found" so existing tests exercise the same
    // single-pass path they did before the reconciliation was added.
    extractBriefSummaryFromSnapshot.mockReturnValue(null);
    mapProviderKeysToDossierCapabilities.mockReturnValue([]);
    selectDossiersForRequest.mockReturnValue({ selected: [], poolSize: 0, byCapability: {} });
    // Version-presence union defaults to "no version files loaded" so existing
    // tests exercise the snapshot/detection path unchanged.
    getVersionFiles.mockResolvedValue(null);
    resolveDossiersPresentInVersion.mockReturnValue([]);
  });

  it("returns 404 when the chat is not visible to the caller", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    const res = await GET(request(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when a requested versionId is not visible to the caller", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const res = await GET(request("ver_missing"), ctx);
    expect(res.status).toBe(404);
    // Must not silently fall back to preferred/latest for a requested-but-missing version.
    expect(resolveSelectedDossiersFromSnapshot).not.toHaveBeenCalled();
  });

  it("marks a hard dossier built-needs-keys when detected but missing real env values", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([softDossier(), stripeDossier()]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [stripeRequirement] });
    validateTier3Readiness.mockReturnValue({
      ready: false,
      missingByIntegration: [
        { key: "stripe", name: "Stripe", missing: ["STRIPE_SECRET_KEY"] },
      ],
    });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    expect(body.versionFilesAvailable).toBe(true);
    expect(body.projectId).toBe("proj_1");
    expect(body.counts).toMatchObject({ total: 2, hard: 1, soft: 1, builtNeedsKeys: 1 });

    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.requiresF3).toBe(true);
    expect(stripe?.status).toBe("built-needs-keys");
    expect(stripe?.missingKeys).toEqual(["STRIPE_SECRET_KEY"]);
    // No stored value and no placeholder coverage → the UI must ask for it.
    expect(stripe?.envVars[0]).toMatchObject({
      key: "STRIPE_SECRET_KEY",
      hasRealValue: false,
      placeholderCovered: false,
    });

    const faq = body.dossiers.find((d) => d.id === "faq-accordion");
    expect(faq?.requiresF3).toBe(false);
    expect(faq?.status).toBe("self-contained");
  });

  it("flags stored real values and placeholder coverage per env key", async () => {
    getStoredProjectEnvVarMap.mockResolvedValue({ STRIPE_SECRET_KEY: "sk_live_real" });
    loadPlaceholderKeySet.mockReturnValue(new Set<string>(["STRIPE_SECRET_KEY"]));
    resolveSelectedDossiersFromSnapshot.mockReturnValue([stripeDossier()]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [stripeRequirement] });
    validateTier3Readiness.mockReturnValue({ ready: true, missingByIntegration: [] });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.status).toBe("built-ready");
    expect(stripe?.envVars[0]).toMatchObject({
      key: "STRIPE_SECRET_KEY",
      hasRealValue: true,
      placeholderCovered: true,
    });
  });

  it("marks a hard dossier not-built when no matching integration is detected", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([stripeDossier()]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.status).toBe("not-built");
    expect(stripe?.missingKeys).toEqual([]);
    // readiness must not run when nothing was detected.
    expect(validateTier3Readiness).not.toHaveBeenCalled();
    expect(body.counts.notBuilt).toBe(1);
  });

  it("flags versionFilesAvailable=false when the build spec cannot be derived", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([stripeDossier()]);
    deriveTier3BuildSpecForVersion.mockResolvedValue(null);

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    expect(body.versionFilesAvailable).toBe(false);
    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.status).toBe("not-built");
  });

  it("does not re-resolve (single build-spec derivation) when nothing needs reconciling — empty case", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    extractBriefSummaryFromSnapshot.mockReturnValue(null);

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    expect(body.dossiers).toEqual([]);
    expect(body.counts.total).toBe(0);
    // Fast path preserved: no second file read / re-resolution when there is
    // nothing to reconcile.
    expect(deriveTier3BuildSpecForVersion).toHaveBeenCalledTimes(1);
    expect(selectDossiersForRequest).not.toHaveBeenCalled();
  });

  // Root-cause regression (F2-mute capability loss): a dossier's files were
  // genuinely injected in a prior F3 round, but a later F2 follow-up dropped
  // its capability from the snapshot's resolved floor
  // (`resolveSelectedDossiersFromSnapshot` → []). Detection from the
  // version's real files must still resurface it instead of the panel
  // reporting zero dossiers.
  it("resurfaces a dossier detected in the version's files when the snapshot capability floor lost it", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [stripeRequirement] });
    mapProviderKeysToDossierCapabilities.mockReturnValue(["payments"]);
    selectDossiersForRequest.mockReturnValue({
      selected: [stripeDossier()],
      poolSize: 10,
      byCapability: { payments: ["stripe-checkout"] },
    });
    validateTier3Readiness.mockReturnValue({
      ready: false,
      missingByIntegration: [
        { key: "stripe", name: "Stripe", missing: ["STRIPE_SECRET_KEY"] },
      ],
    });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    // Re-resolved via the union of capabilities detected in the version's files.
    expect(selectDossiersForRequest).toHaveBeenCalledWith({
      requestedCapabilities: ["payments"],
      // fix-isconfigured: the route now threads the project's stored env key
      // set so `configured` reflects the project, not platform process.env.
      configuredEnvKeys: new Set(),
    });
    // Re-derives the build spec against the reconciled dossier set so env
    // enforcement tagging is correct for the resurfaced dossier.
    expect(deriveTier3BuildSpecForVersion).toHaveBeenCalledTimes(2);

    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe).toBeDefined();
    expect(stripe?.status).toBe("built-needs-keys");
    expect(body.counts.total).toBe(1);
  });

  // Root-cause regression, planned side: a capability the user's brief asked
  // for is still F2-muted (never built), so `resolveSelectedDossiersFromSnapshot`
  // (which reads the mute-filtered floor) returns nothing for it — but the
  // raw brief intent (`briefSummary.requestedCapabilities`) still has it. The
  // panel must surface it as a planned/not-built integration, not omit it.
  it("surfaces a brief-planned, F2-muted capability as a planned (not-built) dossier", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    extractBriefSummaryFromSnapshot.mockReturnValue({ requestedCapabilities: ["payments"] });
    selectDossiersForRequest.mockReturnValue({
      selected: [stripeDossier()],
      poolSize: 10,
      byCapability: { payments: ["stripe-checkout"] },
    });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    expect(selectDossiersForRequest).toHaveBeenCalledWith({
      requestedCapabilities: ["payments"],
      // fix-isconfigured: the route now threads the project's stored env key
      // set so `configured` reflects the project, not platform process.env.
      configuredEnvKeys: new Set(),
    });
    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe).toBeDefined();
    expect(stripe?.status).toBe("not-built");
    expect(body.counts.notBuilt).toBe(1);
    expect(body.counts.total).toBe(1);
    // A brief-only "planned" capability isn't in the files at all, so the
    // build spec must not be re-derived (would just reproduce the same
    // empty `requirements` for an extra file read).
    expect(deriveTier3BuildSpecForVersion).toHaveBeenCalledTimes(1);
  });

  // Canonical version-presence (ai-tool-calling incident): the snapshot floor
  // is empty (F2-muted) and the provider-key→capability mapping resolves
  // `openai` to the `ai-chat` default — never `ai-tool-calling`. The dossier
  // whose files are ACTUALLY in the version (`app/api/assistant/route.ts`) must
  // still surface via the version-presence union so the panel isn't `total: 0`.
  it("surfaces a dossier from its files in the version when the snapshot floor and provider mapping both miss it", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    // Provider mapping resolves nothing useful for ai-tool-calling.
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    mapProviderKeysToDossierCapabilities.mockReturnValue([]);
    // The version's files load, and the presence resolver detects the built
    // ai-tool-calling route.
    getVersionFiles.mockResolvedValue([
      { path: "app/api/assistant/route.ts", content: "// assistant route" },
      { path: "components/ai-assistant.tsx", content: "// ui" },
    ]);
    resolveDossiersPresentInVersion.mockReturnValue([aiToolCallingDossier()]);

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    const aiTool = body.dossiers.find((d) => d.id === "ai-tool-calling-chat");
    expect(aiTool).toBeDefined();
    expect(aiTool?.capability).toBe("ai-tool-calling");
    expect(body.counts.total).toBeGreaterThanOrEqual(1);
    // A version-present dossier the capability pass missed re-derives the spec
    // against the reconciled set (file-based growth).
    expect(deriveTier3BuildSpecForVersion).toHaveBeenCalledTimes(2);
  });

  // Codex P2 (PR #439): `extractBriefSummaryFromSnapshot` casts (does not
  // filter) the persisted array, so a legacy/malformed snapshot can carry
  // non-string entries in `requestedCapabilities`. The route must ignore the
  // junk (same tolerant pattern as `resolveSelectedDossiersFromSnapshot`)
  // instead of throwing `toLowerCase is not a function` and 500:ing.
  it("tolerates non-string entries in briefSummary.requestedCapabilities (legacy/malformed snapshot)", async () => {
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    extractBriefSummaryFromSnapshot.mockReturnValue({
      requestedCapabilities: [null, 42, undefined, "payments", { nested: true }],
    });
    selectDossiersForRequest.mockReturnValue({
      selected: [stripeDossier()],
      poolSize: 10,
      byCapability: { payments: ["stripe-checkout"] },
    });

    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DossierOverviewResponse;

    // Only the valid string capability survives the filter.
    expect(selectDossiersForRequest).toHaveBeenCalledWith({
      requestedCapabilities: ["payments"],
      // fix-isconfigured: the route now threads the project's stored env key
      // set so `configured` reflects the project, not platform process.env.
      configuredEnvKeys: new Set(),
    });
    expect(body.counts.total).toBe(1);
  });
});
