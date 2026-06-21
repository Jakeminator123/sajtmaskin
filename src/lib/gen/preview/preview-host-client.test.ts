import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePreviewHostHttpFailure,
  fetchPreviewHostStatus,
  isPreviewHostDiskFullMessage,
  runPreviewHostQualityGate,
  startPreviewHostSession,
  updatePreviewHostSession,
} from "./preview-host-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  delete process.env.SAJTMASKIN_PREVIEW_HOST_API_KEY;
});

describe("describePreviewHostHttpFailure", () => {
  it("explains stale preview-host deployments for verify-route 404s", () => {
    expect(
      describePreviewHostHttpFailure({
        endpoint: "/preview/verify",
        status: 404,
        body: { message: "Route not found." },
      }),
    ).toContain("appears older than this repo");
  });

  it("falls back to the upstream message for generic failures", () => {
    expect(
      describePreviewHostHttpFailure({
        endpoint: "/preview/session/start",
        status: 500,
        body: { message: "Preview host crashed." },
      }),
    ).toBe("Preview host crashed.");
  });
});

describe("isPreviewHostDiskFullMessage", () => {
  it("detects ENOSPC-style failures", () => {
    expect(isPreviewHostDiskFullMessage("ENOSPC: no space left on device, write")).toBe(true);
    expect(isPreviewHostDiskFullMessage("no space left on device")).toBe(true);
    expect(isPreviewHostDiskFullMessage("Preview host crashed.")).toBe(false);
  });
});

describe("preview-host cleanup retry", () => {
  it("marks session updates as full file-set replacements", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-1",
          previewSessionId: "ps_123",
          startOutcome: "recreated",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await updatePreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-2",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      previewSessionId: "ps_123",
      // Legacy rollout alias for older preview-host deployments.
      // Legacy alias intentionally sent to support older preview-host deploys.
      sandboxId: "ps_123",
      versionId: "version-2",
      replaceFiles: true,
    });
  });

  it("retries preview session start after cleanup on disk full", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: "ENOSPC: no space left on device, write" }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cleaned: true }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            previewUrl: "https://preview-host.example.com/chat-1",
            previewSessionId: "ps_123",
            startOutcome: "recreated",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startPreviewHostSession({
      chatId: "chat-1",
      versionId: "version-1",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.previewSessionId).toBe("ps_123");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://preview-host.example.com/admin/cleanup");
  });

  it("accepts legacy sandboxId from older preview-host responses", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            previewUrl: "https://preview-host.example.com/chat-legacy",
            sandboxId: "legacy_sbx_123",
            startOutcome: "recreated",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await startPreviewHostSession({
      chatId: "chat-legacy",
      versionId: "version-legacy",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.previewSessionId).toBe("legacy_sbx_123");
      expect(result.previewUrl).toBe("https://preview-host.example.com/chat-legacy");
    }
  });

  it("retries verify lane once after cleanup on disk full", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: "ENOSPC: no space left on device, mkdir '/data/verify-workspaces/...'" }),
          { status: 500, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cleaned: true }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            durationMs: 42,
            jobStartedAt: "2026-04-05T09:00:00.000Z",
            jobFinishedAt: "2026-04-05T09:00:42.000Z",
            firstFailureCheck: null,
            results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 42 }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPreviewHostQualityGate({
      chatId: "chat-1",
      versionId: "version-1",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
      checks: ["typecheck"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.check).toBe("typecheck");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://preview-host.example.com/admin/cleanup");
  });
});

describe("fetchPreviewHostStatus version pinning (BUG-SWARM rank 1)", () => {
  function stubStatus(body: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  it("resumes when the host serves the expected version", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
      versionId: "v3",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });

  it("refuses to resume when the host serves a different version (no stale/white iframe)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
      versionId: "v2",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toBeNull();
  });

  it("keeps prior behaviour when the host omits versionId (older deploys)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });

  it("does not gate when no expected version is provided (back-compat)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      sandboxId: "ps_1",
      sandboxUrl: "https://live.example",
      versionId: "v2",
    });

    const result = await fetchPreviewHostStatus("ps_1");
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });
});
