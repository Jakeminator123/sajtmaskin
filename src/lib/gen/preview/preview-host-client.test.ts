import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePreviewHostHttpFailure,
  fetchPreviewHostStatus,
  isPreviewHostDiskFullMessage,
  LEASE_HOLDING_ROUTE_MAX_DURATION_S,
  patchPreviewHostSession,
  PREVIEW_HOST_CLIENT_TIMEOUTS_MS,
  resolvePreviewHostVerifyTimeoutMs,
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

  it("uses a valid changeClass on update (host rejects unknown values)", async () => {
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

    await updatePreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-2",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(["fresh", "light", "medium", "heavy"]).toContain(body.changeClass);
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

describe("patchPreviewHostSession (Fast Edit Lane)", () => {
  it("sends only changed files and surfaces the host patch mode", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-1",
          previewSessionId: "ps_123",
          patchMode: "patched",
          patchReason: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchPreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-3",
      files: { "app/page.tsx": "export default function Page(){return <div>Hej</div>;}" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patchMode).toBe("patched");
      expect(result.previewSessionId).toBe("ps_123");
    }
    const [endpoint, init] = fetchMock.mock.calls[0] ?? [];
    expect(endpoint).toBe("https://preview-host.example.com/preview/session/patch");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      previewSessionId: "ps_123",
      versionId: "version-3",
      files: { "app/page.tsx": "export default function Page(){return <div>Hej</div>;}" },
    });
    expect("filesJson" in body).toBe(false);
  });

  it("flags a missing session so callers fall back to update/start", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "No preview session matched the provided id." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await patchPreviewHostSession({
      previewSessionId: "ps_missing",
      versionId: "version-3",
      files: { "app/page.tsx": "x" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sessionMissing).toBe(true);
    }
  });

  it("includes removedPaths only when provided", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-1",
          previewSessionId: "ps_123",
          patchMode: "patched",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await patchPreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "v",
      files: { "app/page.tsx": "x" },
      removedPaths: ["app/old.tsx"],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.removedPaths).toEqual(["app/old.tsx"]);
  });

  it("threads expectedBaseVersionId into the body for the host TOCTOU re-check (FEL-3)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-1",
          previewSessionId: "ps_123",
          patchMode: "patched",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await patchPreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-new",
      files: { "app/page.tsx": "x" },
      expectedBaseVersionId: "version-base",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.expectedBaseVersionId).toBe("version-base");
  });

  it("omits expectedBaseVersionId when not provided (back-compat with older hosts)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-1",
          previewSessionId: "ps_123",
          patchMode: "patched",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await patchPreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-new",
      files: { "app/page.tsx": "x" },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect("expectedBaseVersionId" in body).toBe(false);
  });

  it("flags a host 409 as baseMismatch so callers do a full (re)start (FEL-3)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "base_mismatch",
            message:
              "Preview session has advanced past the expected base version; refusing partial patch.",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await patchPreviewHostSession({
      previewSessionId: "ps_123",
      versionId: "version-new",
      files: { "app/page.tsx": "x" },
      expectedBaseVersionId: "version-base",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.baseMismatch).toBe(true);
      expect(result.sessionMissing).toBeUndefined();
      expect(result.retryable).toBe(false);
    }
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

describe("fetchPreviewHostStatus content-readiness gate (BUG-SWARM #3)", () => {
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

  it("requireReady: refuses to resume a still-compiling VM (running but not ready)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      ready: false,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1", { requireReady: true });
    expect(result).toBeNull();
  });

  it("requireReady: resumes once the host reports content-readiness", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      ready: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1", { requireReady: true });
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });

  it("requireReady: falls back to running when an older host omits the ready field", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1", { requireReady: true });
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });

  it("default (no requireReady): reuses a live-but-not-ready session (fast-resume semantics)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      ready: false,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1");
    expect(result).toEqual({ previewSessionId: "ps_1", primaryUrl: "https://live.example" });
  });
});

// BUG-SWARM #260 P2: the quality-gate + repair routes hold a per-version lease
// across the /preview/verify call. If the client verify timeout equals the
// route maxDuration there is no headroom for `finally { releaseVersionLease }`
// to run before Vercel hard-kills the function — the lease stays `running`
// until the 15-min TTL and every accept/verify/repair returns version_busy.
describe("verify timeout stays under the lease-holding route budget", () => {
  it("leaves at least 20s of headroom below maxDuration for lease release", () => {
    const routeBudgetMs = LEASE_HOLDING_ROUTE_MAX_DURATION_S * 1000;
    expect(PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify).toBeLessThan(routeBudgetMs);
    expect(routeBudgetMs - PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify).toBeGreaterThanOrEqual(20_000);
  });
});

// #286 Option A — the budget-aware manual-repair final gate passes a per-call
// verify timeout. It can only ever SHORTEN the static cap, never extend it past
// the lease-holding route budget (Codex P1).
describe("resolvePreviewHostVerifyTimeoutMs (#286 per-call verify cap)", () => {
  const staticMs = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify;

  it("falls back to the static timeout when no override is provided (back-compat)", () => {
    expect(resolvePreviewHostVerifyTimeoutMs()).toBe(staticMs);
    expect(resolvePreviewHostVerifyTimeoutMs(undefined)).toBe(staticMs);
  });

  it("uses a smaller override as-is (the budget-bounded case)", () => {
    expect(resolvePreviewHostVerifyTimeoutMs(120_000)).toBe(120_000);
  });

  it("clamps an override above the static cap down to the static timeout", () => {
    expect(resolvePreviewHostVerifyTimeoutMs(staticMs + 100_000)).toBe(staticMs);
    expect(resolvePreviewHostVerifyTimeoutMs(staticMs + 100_000)).toBeLessThanOrEqual(staticMs);
  });

  it("clamps non-positive or non-finite overrides to a safe minimum / the static cap", () => {
    expect(resolvePreviewHostVerifyTimeoutMs(0)).toBe(1);
    expect(resolvePreviewHostVerifyTimeoutMs(-5_000)).toBe(1);
    expect(resolvePreviewHostVerifyTimeoutMs(Number.NaN)).toBe(staticMs);
    expect(resolvePreviewHostVerifyTimeoutMs(Number.POSITIVE_INFINITY)).toBe(staticMs);
  });
});
