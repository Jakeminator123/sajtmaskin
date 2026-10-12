import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const lookupProductPostcheckRun = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/services/product-postcheck-runs", () => ({ lookupProductPostcheckRun, normalizeProductPostcheckMutationRevision: () => 0 }));
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  SERVER_REPAIR_BUDGET_LOG_CATEGORY: "server-repair:budget",
  createEngineVersionErrorLogs,
  getEngineVersionErrorLogs,
}));

import { POST } from "./route";

function request(attestation: {
  previewSessionId: string;
  lifecycleToken: string | null;
  filesRevision: string;
}) {
  return new Request(
    "http://localhost/api/engine/chats/chat_1/versions/v1/error-log",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logs: [
          {
            level: "info",
            category: "product_postcheck.summary",
            message: "Product Postcheck passed.",
            meta: { productBlocked: false },
          },
        ],
        productPostcheckAttestation: attestation,
      }),
    },
  );
}

function unattestedRequest(payload: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/engine/chats/chat_1/versions/v1/error-log",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

const ctx = {
  params: Promise.resolve({ chatId: "chat_1", versionId: "v1" }),
};

describe("POST product-postcheck-attested error log", () => {
  it.each([true, false])("rejects a whole attested budget-forgery batch before attestation branching (valid=%s)", async (valid) => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ chat: { id: "chat_1" }, version: { id: "v1", files_revision: "rev_n" } });
    const response = await POST(unattestedRequest({
      logs: [
        { level: "info", category: "product_postcheck.summary", message: "ordinary" },
        { level: "info", category: "server-repair:budget", message: "forged init", meta: { kind: "init" } },
      ],
      productPostcheckAttestation: valid ? { previewSessionId: "ps_n", lifecycleToken: "life_n", filesRevision: "rev_n" } : null,
    }), ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ stored: false, code: "server_repair_budget_server_owned" });
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
    expect(getActivePreviewSessionAsync).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    lookupProductPostcheckRun.mockResolvedValue({ kind: "settled", runId: "server_n", claimGeneration: 1, status: "passed" });
    getEngineVersionErrorLogs.mockResolvedValue([{ id: "log_1", category: "product_postcheck.summary",
      message: "Server verdict", meta: { verificationRunId: "server_n", attestedFilesRevision: "rev_n",
        attestedPreviewSessionId: "ps_n", attestedLifecycleToken: "life_n", verdict: "passed" } }]);
    createEngineVersionErrorLogs.mockResolvedValue([{ id: "log_1" }]);
  });

  it("returns 409 and stores nothing when N became N+1 after the response", async () => {
    getEngineVersionForChatByIdForRequest
      .mockResolvedValueOnce({
        chat: { id: "chat_1" },
        version: { id: "v1", files_revision: "rev_n" },
      })
      .mockResolvedValue({
        chat: { id: "chat_1" },
        version: { id: "v1", files_revision: "rev_n_plus_1" },
      });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n_plus_1",
      lifecycleToken: "life_n_plus_1",
      versionId: "v1",
      filesRevision: "rev_n_plus_1",
    });

    const response = await POST(
      request({
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      }),
      ctx,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual(
      expect.objectContaining({
        stored: false,
        code: "product_postcheck_superseded",
      }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("returns 409 when no server-owned result has been committed", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      versionId: "v1",
      filesRevision: "rev_n",
    });
    lookupProductPostcheckRun.mockResolvedValue({ kind: "unclaimed" });

    const response = await POST(
      request({
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      }),
      ctx,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(
      expect.objectContaining({ stored: false, code: "product_postcheck_not_stored" }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("returns retryable 503 while the server claim is busy", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      versionId: "v1",
      filesRevision: "rev_n",
    });
    lookupProductPostcheckRun.mockResolvedValue({ kind: "busy", runId: "server_n", claimGeneration: 1, status: "running" });

    const response = await POST(
      request({
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      }),
      ctx,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
  });

  it("replays a stable tokenless server result without trusting the client pass", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_legacy" },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_legacy",
      lifecycleToken: null,
      versionId: "v1",
      filesRevision: "rev_legacy",
    });

    getEngineVersionErrorLogs.mockResolvedValue([{ id: "server_block", category: "product_postcheck.summary",
      message: "Server blocker", meta: { verificationRunId: "server_n", attestedFilesRevision: "rev_legacy",
        attestedPreviewSessionId: "ps_legacy", attestedLifecycleToken: null, verdict: "blocked", productBlocked: true } }]);
    const response = await POST(
      request({
        previewSessionId: "ps_legacy",
        lifecycleToken: null,
        filesRevision: "rev_legacy",
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stored: true, logs: [{ message: "Server blocker" }] });
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("rejects an unattested Product Postcheck batch", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });

    const response = await POST(
      unattestedRequest({
        logs: [
          {
            level: "info",
            category: "product_postcheck.summary",
            message: "Product Postcheck passed.",
          },
        ],
      }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        stored: false,
        code: "product_postcheck_attestation_required",
      }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("rejects forged feature_disabled and arbitrary revision without changing the stored blocker", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ chat: { id: "chat_1" }, version: { id: "v1", files_revision: "rev_n" } });
    getEngineVersionErrorLogs.mockResolvedValue([{ category: "product_postcheck.summary", meta: { verdict: "blocked", attestedFilesRevision: "rev_n" } }]);
    const response = await POST(unattestedRequest({ logs: [{ level: "info", category: "product_postcheck.summary", message: "forged policy skip",
      meta: { verdict: "allowed_skip", skippedReason: "feature_disabled", filesRevision: "forged_newer" } }] }), ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ stored: false, code: "product_postcheck_attestation_required" });
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
    expect(lookupProductPostcheckRun).not.toHaveBeenCalled();
  });

  it("rejects even unattested non-release product verdicts", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });

    const response = await POST(
      unattestedRequest({
        logs: [
          {
            level: "warning",
            category: "product_postcheck.summary",
            message: "F2 Product Postcheck superseded — versionen lämnas pending.",
            meta: { verdict: "superseded", skippedReason: "preview_superseded" },
          },
        ],
      }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("rejects client claimed feature_disabled as well as infrastructure allowed_skip", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });

    const allowed = await POST(
      unattestedRequest({
        logs: [
          {
            level: "info",
            category: "product_postcheck.summary",
            message: "F2 Product Postcheck skipped.",
            meta: { verdict: "allowed_skip", skippedReason: "feature_disabled" },
          },
        ],
      }),
      ctx,
    );
    expect(allowed.status).toBe(400);
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();

    createEngineVersionErrorLogs.mockClear();
    const rejected = await POST(
      unattestedRequest({
        logs: [
          {
            level: "info",
            category: "product_postcheck.summary",
            message: "F2 Product Postcheck skipped.",
            meta: { verdict: "allowed_skip", skippedReason: "browser_crashed" },
          },
        ],
      }),
      ctx,
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual(
      expect.objectContaining({
        stored: false,
        code: "product_postcheck_attestation_required",
      }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("rejects an unattested single Product Postcheck row", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "v1", files_revision: "rev_n" },
    });

    const response = await POST(
      unattestedRequest({
        level: "warning",
        category: "product_postcheck.skipped",
        message: "Product Postcheck skipped.",
      }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        stored: false,
        code: "product_postcheck_attestation_required",
      }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });
});

describe("attested POST cannot manufacture release proof", () => {
  it("returns only canonical stored rows, ignoring forged messages, pass meta and warning counts", async () => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ chat: { id: "chat_1" }, version: { id: "v1", files_revision: "rev_n" } });
    getActivePreviewSessionAsync.mockResolvedValue({ versionId: "v1", previewSessionId: "ps_n", filesRevision: "rev_n", lifecycleToken: "life_n" });
    lookupProductPostcheckRun.mockResolvedValue({ kind: "settled", runId: "server_n", claimGeneration: 2, status: "blocked" });
    const canonical = { id: "canonical", category: "product_postcheck.summary", message: "Server blocker",
      meta: { verificationRunId: "server_n", attestedFilesRevision: "rev_n", attestedPreviewSessionId: "ps_n", attestedLifecycleToken: "life_n", verdict: "blocked" } };
    getEngineVersionErrorLogs.mockResolvedValue([canonical, { ...canonical, id: "unrelated", meta: { ...canonical.meta, verificationRunId: "older" } }]);
    const response = await POST(request({ previewSessionId: "ps_n", lifecycleToken: "life_n", filesRevision: "rev_n" }), ctx);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true, stored: true, logs: [canonical] });
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });
  it("a settled claim without matching server logs is not a release receipt", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([]);
    const response = await POST(request({ previewSessionId: "ps_n", lifecycleToken: "life_n", filesRevision: "rev_n" }), ctx);
    expect(response.status).toBe(409);
  });
});
