import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const createAttestedProductPostcheckErrorLogs = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createAttestedProductPostcheckErrorLogs,
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
  beforeEach(() => {
    vi.clearAllMocks();
    createAttestedProductPostcheckErrorLogs.mockResolvedValue({
      status: "stored",
      logs: [{ id: "log_1" }],
    });
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
    expect(createAttestedProductPostcheckErrorLogs).not.toHaveBeenCalled();
  });

  it("returns 409 when the locked DB revision supersedes the pre-check", async () => {
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
    createAttestedProductPostcheckErrorLogs.mockResolvedValue({
      status: "superseded",
      logs: [],
    });

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
      expect.objectContaining({ stored: false, code: "product_postcheck_superseded" }),
    );
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("returns retryable 503 when the version row is contended", async () => {
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
    createAttestedProductPostcheckErrorLogs.mockResolvedValue({
      status: "contention",
      logs: [],
    });

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

  it("stores a stable tokenless legacy attestation", async () => {
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

    const response = await POST(
      request({
        previewSessionId: "ps_legacy",
        lifecycleToken: null,
        filesRevision: "rev_legacy",
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(createAttestedProductPostcheckErrorLogs).toHaveBeenCalledTimes(1);
    const [rows, options] = createAttestedProductPostcheckErrorLogs.mock.calls[0]!;
    expect(rows[0].meta).toEqual(
      expect.objectContaining({
        attestedPreviewSessionId: "ps_legacy",
        attestedLifecycleToken: null,
        attestedFilesRevision: "rev_legacy",
      }),
    );
    expect(options).toEqual(
      expect.objectContaining({ expectedFilesRevision: "rev_legacy" }),
    );
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
    expect(createAttestedProductPostcheckErrorLogs).not.toHaveBeenCalled();
  });

  it("stores an unattested non-release verdict (pending/superseded)", async () => {
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

    expect(response.status).toBe(200);
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          category: "product_postcheck.summary",
          meta: expect.objectContaining({ verdict: "superseded" }),
        }),
      ],
      expect.anything(),
    );
    expect(createAttestedProductPostcheckErrorLogs).not.toHaveBeenCalled();
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
    expect(createAttestedProductPostcheckErrorLogs).not.toHaveBeenCalled();
  });
});
