import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectedDossier } from "@/lib/gen/dossiers/types";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const resolveSelectedDossiersFromSnapshot = vi.hoisted(() => vi.fn());
const deriveTier3BuildSpecForVersion = vi.hoisted(() => vi.fn());
const validateTier3Readiness = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  deriveTier3BuildSpecForVersion,
}));

vi.mock("@/lib/integrations/tier3-build-spec", () => ({
  validateTier3Readiness,
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
    expect(body.counts).toMatchObject({ total: 2, hard: 1, soft: 1, builtNeedsKeys: 1 });

    const stripe = body.dossiers.find((d) => d.id === "stripe-checkout");
    expect(stripe?.requiresF3).toBe(true);
    expect(stripe?.status).toBe("built-needs-keys");
    expect(stripe?.missingKeys).toEqual(["STRIPE_SECRET_KEY"]);

    const faq = body.dossiers.find((d) => d.id === "faq-accordion");
    expect(faq?.requiresF3).toBe(false);
    expect(faq?.status).toBe("self-contained");
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
});
