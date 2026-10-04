import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const appendF3ApprovedToSnapshot = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const checkTier3ReadinessForVersion = vi.hoisted(() => vi.fn());
const logTier3MissingEnvBlockedDetached = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion,
  getPreferredVersion,
  getVersionsByChat,
  createDraftVersion,
  appendF3ApprovedToSnapshot,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  checkTier3ReadinessForVersion,
}));

vi.mock("@/lib/integrations/log-tier3-missing-env", () => ({
  logTier3MissingEnvBlockedDetached,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/engine/chats/chat_1/finalize-design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST finalize-design", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: null,
    });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_current",
        chat_id: "chat_1",
        lifecycle_stage: "design",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
      },
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_current",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
    });
    getLatestVersion.mockResolvedValue(null);
    getVersionsByChat.mockResolvedValue([]);
    createDraftVersion.mockResolvedValue({
      id: "ver_f3_exact",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      parent_version_id: "ver_current",
      files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
      release_state: "draft",
      verification_state: "pending",
    });
    appendF3ApprovedToSnapshot.mockResolvedValue(true);
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "F2 exact" },
    ]);
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: { requirements: [] },
    });
  });

  it("blocks an unresolved provider contract before readiness or a deterministic fork", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        contractIntegrations: [
          {
            kind: "auth",
            dossierCapability: "auth",
            selectionSource: "explicit",
            provider: "Authentication provider not selected",
            name: "Authentication provider not selected",
            reason: "Clerk was rejected",
            status: "unresolved",
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ready: false,
      reason: "integration_contract_unresolved",
      capability: "auth",
    });
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("fails closed when the base version files cannot be read", async () => {
    getVersionFiles.mockRejectedValue(new Error("storage unavailable"));
    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "version_files_unavailable" });
    expect(appendF3ApprovedToSnapshot).not.toHaveBeenCalled();
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("blocks an explicit unsupported provider instead of falling back to Stripe", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: ["payments"],
        contractIntegrations: [
          {
            kind: "payment",
            providerKey: "swish",
            dossierCapability: "payments",
            selectionSource: "explicit",
            provider: "Swish",
            name: "Swish",
            reason: "Explicit provider",
            status: "chosen",
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      reason: "integration_contract_unresolved",
      provider: "Swish",
    });
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
  });

  it("sends a known dossierless provider through readiness and the F3 stream", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: ["database"],
        contractIntegrations: [
          {
            kind: "database",
            providerKey: "mongodb",
            dossierCapability: "database",
            selectionSource: "explicit",
            provider: "MongoDB",
            name: "MongoDB",
            reason: "Explicit provider",
            status: "chosen",
          },
        ],
      },
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: { requirements: [{ key: "mongodb", requiredRealEnvKeys: [] }] },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ready: true,
      plannedDossierIds: [],
      plannedProviderKeys: ["mongodb"],
      streamMeta: { lifecycleStage: "integrations" },
    });
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({ pendingApprovedProviderKeys: ["mongodb"] }),
    );
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("does not schedule a generic provider that exact package and runtime evidence already delivers", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: ["database"],
        contractIntegrations: [
          {
            kind: "database",
            providerKey: "mongodb",
            dossierCapability: "database",
            selectionSource: "explicit",
            provider: "MongoDB",
            name: "MongoDB",
            reason: "Explicit provider",
            status: "chosen",
          },
        ],
      },
    });
    getVersionFiles.mockResolvedValue([
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { mongodb: "^6" } }),
      },
      {
        path: "lib/mongodb.ts",
        content: 'import { MongoClient } from "mongodb"; export const client = new MongoClient("mongodb://example");',
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: "deterministic_release" });
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({ pendingApprovedProviderKeys: [] }),
    );
    expect(appendF3ApprovedToSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    [false, ["auth0"], undefined],
    [true, [], "deterministic_release"],
  ])(
    "does not let a Clerk-owned path turn Auth0 context-only work into a migration blocker (delivered=%s)",
    async (delivered, expectedProviderKeys, expectedAction) => {
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: null,
        orchestration_snapshot: {
          mutedCapabilities: ["auth"],
          contractIntegrations: [
            {
              kind: "auth",
              providerKey: "auth0",
              dossierCapability: "auth",
              selectionSource: "explicit",
              provider: "Auth0",
              name: "Auth0",
              reason: "Explicit provider",
              status: "chosen",
            },
          ],
        },
      });
      getVersionFiles.mockResolvedValue([
        {
          path: "middleware.ts",
          content: "export const middleware = auth0Middleware;",
        },
        ...(delivered
          ? [
              {
                path: "package.json",
                content: JSON.stringify({ dependencies: { "@auth0/nextjs-auth0": "^4" } }),
              },
              {
                path: "lib/auth0.ts",
                content: 'import { Auth0Client } from "@auth0/nextjs-auth0/server"; export const auth0 = new Auth0Client();',
              },
            ]
          : []),
      ]);

      const res = await POST(request({ versionId: "ver_current" }), {
        params: Promise.resolve({ chatId: "chat_1" }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.reason).not.toBe("integration_migration_required");
      if (expectedAction) expect(body).toMatchObject({ action: expectedAction });
      else expect(body).toMatchObject({ plannedProviderKeys: expectedProviderKeys });
    },
  );

  it.each([
    [false, 409, undefined],
    [true, 200, "deterministic_release"],
  ])(
    "requires real Prisma implementation evidence before deterministic release (implemented=%s)",
    async (implemented, expectedStatus, expectedAction) => {
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: null,
        orchestration_snapshot: {
          mutedCapabilities: ["database"],
          contractIntegrations: [
            {
              kind: "database",
              providerKey: "postgres",
              dossierCapability: "database",
              selectionSource: "explicit",
              provider: "Postgres / DATABASE_URL",
              name: "Postgres",
              reason: "Explicit provider",
              status: "chosen",
            },
            {
              kind: "database",
              providerKey: "prisma",
              selectionSource: "explicit",
              provider: "Prisma",
              name: "Prisma",
              reason: "Explicit database method",
              status: "chosen",
            },
          ],
        },
      });
      if (implemented) {
        getVersionFiles.mockResolvedValue([
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "@prisma/client": "^6" } }),
          },
          {
            path: "lib/db.ts",
            content: 'import { PrismaClient } from "@prisma/client"; export const db = new PrismaClient();',
          },
        ]);
      }

      const res = await POST(request({ versionId: "ver_current" }), {
        params: Promise.resolve({ chatId: "chat_1" }),
      });
      const body = await res.json();
      expect(res.status).toBe(expectedStatus);
      if (expectedAction) expect(body).toMatchObject({ action: expectedAction });
      else expect(body).toMatchObject({ reason: "integration_migration_required" });
      expect(body.plannedDossierIds ?? []).not.toContain("postgres-drizzle");
    },
  );

  it("does not approve hosted Checkout over existing Stripe Elements runtime evidence", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: ["payments"],
        contractIntegrations: [
          {
            kind: "payment",
            providerKey: "stripe",
            dossierCapability: "payments",
            selectionSource: "explicit",
            provider: "Stripe",
            name: "Stripe",
            reason: "Explicit provider",
            status: "chosen",
          },
        ],
      },
    });
    getVersionFiles.mockResolvedValue([
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { "@stripe/react-stripe-js": "^3" } }),
      },
      {
        path: "components/payment.tsx",
        content: 'import { Elements } from "@stripe/react-stripe-js"; export { Elements };',
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: "deterministic_release" });
    expect(appendF3ApprovedToSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["auth", "supabase", "Supabase", "supabase-auth"],
    ["ai-chat", "openai", "OpenAI", "openai-chat"],
  ])(
    "treats the provider-capability pair %s/%s as exact dossier work, not generic work",
    async (capability, providerKey, provider, dossierId) => {
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: null,
        orchestration_snapshot: {
          mutedCapabilities: [capability],
          contractIntegrations: [
            {
              kind: capability === "auth" ? "auth" : "integration",
              providerKey,
              dossierCapability: capability,
              selectionSource: "explicit",
              provider,
              name: provider,
              reason: "Explicit provider",
              status: "chosen",
            },
          ],
        },
      });

      const res = await POST(request({ versionId: "ver_current" }), {
        params: Promise.resolve({ chatId: "chat_1" }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        plannedDossierIds: [dossierId],
        plannedProviderKeys: [],
      });
      expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingApprovedDossierIds: [dossierId],
          pendingApprovedProviderKeys: [],
        }),
      );
    },
  );

  it("blocks F3 server-side when the newest product_postcheck.summary is productBlocked (Codex P1 r3)", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "product_postcheck_blocked",
      verdict: "blocked",
      retryable: false,
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ready).toBe(false);
    expect(body.reason).toBe("product_postcheck_blocked");
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: "ver_current",
        orchestrationSnapshot: null,
        projectId: null,
      }),
    );
  });

  it("(f) pending postcheck returns retryable 409 and does not finalize", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "product_postcheck_pending",
      verdict: "pending",
      retryable: true,
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ready: false,
      reason: "product_postcheck_pending",
      verdict: "pending",
      retryable: true,
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
    expect(appendF3ApprovedToSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an explicit stale design version before deriving F3 requirements", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_old",
        chat_id: "chat_1",
        lifecycle_stage: "design",
      },
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_new",
      chat_id: "chat_1",
      lifecycle_stage: "design",
    });

    const res = await POST(request({ versionId: "ver_old" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe("stale_design_version");
    expect(body.requestedVersionId).toBe("ver_old");
    expect(body.latestVersionId).toBe("ver_new");
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
  });

  it("does not fall back when an explicit version is outside the tenant/chat scope", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(request({ versionId: "ver_foreign" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Version not found for chat" });
    expect(getPreferredVersion).not.toHaveBeenCalled();
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
  });

  it("does not greenlight F3 when version files are unavailable (G#21)", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "version_files_unavailable",
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ready).toBe(false);
    expect(body.reason).toBe("version_files_unavailable");
  });

  it("returns retryable 409 semantics when the shared readiness gate throws", async () => {
    checkTier3ReadinessForVersion.mockRejectedValue(
      new Error("transient db read"),
    );

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ready: false,
      reason: "version_files_unavailable",
      parentVersionId: "ver_current",
    });
  });

  it("keeps F2 files and visual fallback when no real build key is required", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "openai",
            name: "OpenAI",
            requiredRealEnvKeys: [],
            featureRuntimeEnvKeys: ["OPENAI_API_KEY"],
            warnOnlyEnvKeys: [],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ready: true,
      action: "deterministic_release",
      parentVersionId: "ver_current",
      versionId: "ver_f3_exact",
      lifecycleStage: "integrations",
      gateRequired: true,
      releaseState: "draft",
      verificationState: "pending",
    });
    expect(body.streamMeta).toBeUndefined();
    expect(body.requirements).toEqual([
      expect.objectContaining({
        key: "openai",
        featureRuntimeEnvKeys: ["OPENAI_API_KEY"],
      }),
    ]);
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_1",
      null,
      '[{"path":"app/page.tsx","content":"F2 exact"}]',
      undefined,
      {
        stage: "integrations",
        parentVersionId: "ver_current",
        // No keys persisted on the F2 base in this fixture → explicit null.
        selectedDossierEnvKeys: null,
      },
    );
  });

  // Dossier-env rehydrering: the exact-file F3 fork copies the F2 base's
  // persisted dossier env keys so the row carries the same preview env
  // contract (harmless on F3 — the mock-seed only runs in design stage).
  it("copies the F2 base's persisted selected_dossier_env_keys onto the deterministic F3 fork", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_current",
        chat_id: "chat_1",
        lifecycle_stage: "design",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        selected_dossier_env_keys: ["STRIPE_SECRET_KEY", "EMAIL_FROM"],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_1",
      null,
      expect.any(String),
      undefined,
      expect.objectContaining({
        stage: "integrations",
        parentVersionId: "ver_current",
        selectedDossierEnvKeys: ["STRIPE_SECRET_KEY", "EMAIL_FROM"],
      }),
    );
  });

  it("uses the deterministic exact-file F3 fork for an empty spec", async () => {
    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_exact",
      requirements: [],
    });
    expect(createDraftVersion).toHaveBeenCalledTimes(1);
  });

  it("starts the LLM build for an exact planned dossier even without build-enforced keys", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: ["payments"],
        mutedDossierIds: ["stripe-checkout"],
      },
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "stripe-checkout",
            name: "Betalning — Stripe",
            requiredRealEnvKeys: [],
            featureRuntimeEnvKeys: ["STRIPE_SECRET_KEY"],
            placeholderOkEnvKeys: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
            warnOnlyEnvKeys: [],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ready: true,
      parentVersionId: "ver_current",
      plannedDossierIds: ["stripe-checkout"],
      streamMeta: {
        lifecycleStage: "integrations",
        parentVersionId: "ver_current",
      },
    });
    expect(body.action).toBeUndefined();
    // Fjärde argumentet ersätter tidigare val för samma capability: syskonen
    // till det godkända id:t pekas ut så en gammal, aldrig levererad approval
    // inte ligger kvar och vinner över det nya valet i dossierProviderHints.
    expect(appendF3ApprovedToSnapshot).toHaveBeenCalledWith(
      "chat_1",
      ["payments"],
      ["stripe-checkout"],
      expect.not.arrayContaining(["stripe-checkout"]),
    );
    const supersededArg = appendF3ApprovedToSnapshot.mock.calls[0]?.[3] as string[];
    expect(Array.isArray(supersededArg)).toBe(true);
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingApprovedDossierIds: ["stripe-checkout"],
      }),
    );
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("restarts the approved OpenAI build from the selected design version after failed F3 evidence", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: {
        mutedCapabilities: [],
        mutedDossierIds: [],
        f3ApprovedCapabilities: ["ai-chat"],
        f3ApprovedProviders: ["openai-chat"],
        fileEvidenceCapabilities: ["ai-chat"],
        fileEvidenceDossierIds: ["openai-chat"],
      },
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "openai-chat",
            name: "AI-chatt — OpenAI",
            requiredRealEnvKeys: [],
            featureRuntimeEnvKeys: ["OPENAI_API_KEY"],
            placeholderOkEnvKeys: [],
            warnOnlyEnvKeys: [],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ready: true,
      parentVersionId: "ver_current",
      plannedDossierIds: ["openai-chat"],
      streamMeta: {
        lifecycleStage: "integrations",
        parentVersionId: "ver_current",
      },
    });
    expect(body.action).toBeUndefined();
    expect(appendF3ApprovedToSnapshot).toHaveBeenCalledWith(
      "chat_1",
      ["ai-chat"],
      ["openai-chat"],
      expect.not.arrayContaining(["openai-chat"]),
    );
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingApprovedDossierIds: ["openai-chat"],
      }),
    );
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("reuses an already-promoted exact F3 fork without demoting it", async () => {
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_f3_newer_draft",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "draft",
        verification_state: "pending",
      },
      {
        id: "ver_f3_existing",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "promoted",
        verification_state: "passed",
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_existing",
      gateRequired: false,
      reused: true,
      releaseState: "promoted",
      verificationState: "passed",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("reuses an existing draft exact-file F3 fork on retry", async () => {
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_f3_draft",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "draft",
        verification_state: "pending",
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_draft",
      gateRequired: true,
      reused: true,
      releaseState: "draft",
      verificationState: "pending",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("returns retryable 409 semantics when deterministic fork persistence fails", async () => {
    getVersionsByChat.mockRejectedValue(new Error("transient db error"));

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ready: false,
      reason: "f3_fork_unavailable",
      parentVersionId: "ver_current",
    });
  });

  it("keeps the existing 412 requirements path when a real build key is missing", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "missing_env",
      spec: {
        requirements: [
          {
            key: "clerk",
            name: "Clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
          },
        ],
      },
      readiness: {
        ready: false,
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(412);
    expect(body).toMatchObject({
      ready: false,
      parentVersionId: "ver_current",
      missingByIntegration: [
        { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
      ],
    });
    expect(body.action).toBeUndefined();
    expect(logTier3MissingEnvBlockedDetached).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_current",
        source: "finalize-design",
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      }),
    );
  });

  it("preserves the gated F3 stream path when a required build key is ready", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "openai",
            name: "OpenAI",
            requiredRealEnvKeys: [],
          },
          {
            key: "clerk",
            name: "Clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready?: boolean;
      action?: string;
      parentVersionId?: string;
      streamMeta?: { lifecycleStage?: string; parentVersionId?: string };
    };
    expect(body.ready).toBe(true);
    expect(body.action).toBeUndefined();
    expect(body.parentVersionId).toBe("ver_current");
    expect(body.streamMeta).toEqual({
      lifecycleStage: "integrations",
      parentVersionId: "ver_current",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });
});
