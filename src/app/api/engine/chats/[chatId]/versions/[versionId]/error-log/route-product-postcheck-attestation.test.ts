import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
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

const ctx = {
  params: Promise.resolve({ chatId: "chat_1", versionId: "v1" }),
};

describe("POST product-postcheck-attested error log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
  });
});

