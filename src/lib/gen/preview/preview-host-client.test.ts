import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePreviewHostHttpFailure,
  fetchPreviewHostFilesManifest,
  fetchPreviewHostReadinessVerdict,
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

  it("sends the host-only prewarm intent and opaque lease key", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          previewUrl: "https://preview-host.example.com/chat-prewarm",
          previewSessionId: "ps_prewarm",
          startOutcome: "recreated",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startPreviewHostSession({
      chatId: "chat-prewarm",
      versionId: "chat-prewarm-prewarm",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
      prewarm: true,
      prewarmLeaseKey: "a".repeat(64),
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      prewarm: true,
      prewarmLeaseKey: "a".repeat(64),
    });
  });

  it.each([
    [409, "prewarm_superseded", "superseded"],
    [429, "prewarm_rate_limited", "rate_limited"],
  ] as const)("classifies terminal prewarm HTTP %i without retry", async (status, error, disposition) => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error, message: error }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startPreviewHostSession({
      chatId: "chat-prewarm",
      versionId: "chat-prewarm-prewarm",
      filesJson: { "app/page.tsx": "export default function Page(){return null;}" },
      prewarm: true,
      prewarmLeaseKey: "a".repeat(64),
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      prewarmDisposition: disposition,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(result).toEqual({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: null,
      httpReady: false,
      readinessError: null,
      installDiagnostics: null,
      regeneratedLockfile: null,
    });
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

  // Detta test låste tidigare motsatt beteende ("saknat eko = OK", bakåtkompat
  // med hostar som inte returnerade versionId). Hosten ekar alltid versionen i
  // dag, så den motiveringen är förbrukad — det enda mönstret fortfarande
  // skyddar är false-green: en anropare som VET vilken version den väntar sig
  // återupptar en session som ingen har bekräftat.
  it("refuses to resume when the host echoes no versionId at all (silence is not a match)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toBeNull();
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
    expect(result).toEqual({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: null,
      httpReady: false,
      readinessError: null,
      installDiagnostics: null,
      regeneratedLockfile: null,
    });
  });

  it("surfaces readinessState=ready + httpReady from the host body", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      httpReady: true,
      readinessState: "ready",
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
      versionId: "v3",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toMatchObject({
      readinessState: "ready",
      httpReady: true,
      readinessError: null,
    });
  });

  it("surfaces readinessState=failed + readinessError (running but build-error overlay)", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      httpReady: false,
      readinessState: "failed",
      readinessError: "Module not found: Can't resolve 'radix-ui'",
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
      versionId: "v3",
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result).toMatchObject({
      readinessState: "failed",
      httpReady: false,
      readinessError: "Module not found: Can't resolve 'radix-ui'",
    });
  });

  it("surfaces the regenerated lockfile after a stale-lockfile reconcile", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      httpReady: true,
      readinessState: "ready",
      previewSessionId: "ps_1",
      previewUrl: "https://live.example",
      versionId: "v3",
      regeneratedLockfile: { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n" },
    });

    const result = await fetchPreviewHostStatus("ps_1", { expectedVersionId: "v3" });
    expect(result?.regeneratedLockfile).toEqual({
      path: "pnpm-lock.yaml",
      content: "lockfileVersion: '9.0'\n",
    });
  });
});

describe("fetchPreviewHostFilesManifest", () => {
  function stubManifest(body: Record<string, unknown>, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  const validBody = {
    ok: true,
    previewSessionId: "ps_1",
    versionId: "v3",
    running: true,
    hashAlgorithm: "sha256",
    files: { "app/page.tsx": "a".repeat(64) },
  };

  it("parses the host manifest", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubManifest(validBody);

    const result = await fetchPreviewHostFilesManifest("ps_1");
    expect(result).toEqual({
      previewSessionId: "ps_1",
      versionId: "v3",
      running: true,
      files: { "app/page.tsx": "a".repeat(64) },
    });
  });

  it("returns null on 404 so an older preview-host simply falls back to update", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubManifest({ error: "not_found" }, 404);

    expect(await fetchPreviewHostFilesManifest("ps_1")).toBeNull();
  });

  it("refuses a manifest hashed with anything but sha256", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubManifest({ ...validBody, hashAlgorithm: "blake3" });

    expect(await fetchPreviewHostFilesManifest("ps_1")).toBeNull();
  });

  it("refuses a manifest with a non-string hash entry", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubManifest({ ...validBody, files: { "app/page.tsx": 42 } });

    expect(await fetchPreviewHostFilesManifest("ps_1")).toBeNull();
  });

  it("reports a null versionId when the host session is unpinned", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubManifest({ ...validBody, versionId: null });

    const result = await fetchPreviewHostFilesManifest("ps_1");
    expect(result?.versionId).toBeNull();
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

// En boot som dör före dev-processen (install-fel, misslyckad postcondition,
// readiness-deadline) lämnar `running:false` men `readinessState:"failed"`.
// Resume-vägen svarar null där — den frågar "går sessionen att återuppta?" —
// så utan denna avläsning stämplas aldrig preview_success=false och RepairGate
// får aldrig veta att previewn bevisligen inte kan komma upp.
describe("fetchPreviewHostReadinessVerdict — läser verdikt även utan levande process", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  });

  function stubStatus(body: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  it("returnerar failed-verdiktet när processen aldrig startade", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: false,
      httpReady: false,
      readinessState: "failed",
      readinessError: "npm error code ENOSPC",
      versionId: "v3",
      previewSessionId: "ps_1",
    });

    const verdict = await fetchPreviewHostReadinessVerdict("ps_1", { expectedVersionId: "v3" });

    expect(verdict).toMatchObject({
      running: false,
      readinessState: "failed",
      readinessError: "npm error code ENOSPC",
      versionId: "v3",
    });
  });

  it("surfaces installDiagnostics from a failed install without requiring a live process", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: false,
      httpReady: false,
      readinessState: "failed",
      readinessError: "npm install --no-audit --include=dev failed with exit code 254 (no_output)",
      versionId: "v3",
      previewSessionId: "ps_1",
      installDiagnostics: {
        exitCode: 254,
        signal: null,
        failureReason: "no_output",
        memory: { freeBytes: 10, totalBytes: 20, rssBytes: 3, heapUsedBytes: 1, heapTotalBytes: 2 },
        concurrentRuntimes: 2,
        inflightBoots: 1,
        npmDebugLog: {
          path: "/data/package-caches/npm/_logs/last-debug.log",
          mtime: "2026-08-21T02:00:00.000Z",
          bytes: 12,
          clippedContent: "debug tail",
        },
      },
    });

    const verdict = await fetchPreviewHostReadinessVerdict("ps_1", { expectedVersionId: "v3" });
    expect(verdict?.installDiagnostics).toMatchObject({
      exitCode: 254,
      failureReason: "no_output",
      concurrentRuntimes: 2,
      npmDebugLog: { clippedContent: "debug tail" },
    });
  });

  it("returnerar null när hosten pratar om en annan version", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: false,
      readinessState: "failed",
      readinessError: "boom",
      versionId: "v2",
      previewSessionId: "ps_1",
    });

    expect(await fetchPreviewHostReadinessVerdict("ps_1", { expectedVersionId: "v3" })).toBeNull();
  });

  it("returnerar null när hosten inte ekar någon version alls", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: false,
      readinessState: "failed",
      readinessError: "boom",
      previewSessionId: "ps_1",
    });

    // Ett verdikt utan versionsattribution får inte stämplas på anroparens
    // version: det skulle antingen godkänna en version vi aldrig sett bekräftad
    // eller trigga RepairGate på ett fel som hör till en annan version.
    expect(await fetchPreviewHostReadinessVerdict("ps_1", { expectedVersionId: "v3" })).toBeNull();
  });

  it("returnerar verdiktet när anroparen inte har någon förväntad version", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: false,
      readinessState: "failed",
      readinessError: "boom",
      previewSessionId: "ps_1",
    });

    expect(await fetchPreviewHostReadinessVerdict("ps_1")).toMatchObject({
      readinessState: "failed",
      readinessError: "boom",
      versionId: null,
    });
  });

  it("behåller utelämnad httpReady som null, inte false", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({
      ok: true,
      running: true,
      readinessState: "ready",
      versionId: "v3",
      previewSessionId: "ps_1",
    });

    expect(await fetchPreviewHostReadinessVerdict("ps_1")).toMatchObject({
      httpReady: null,
      readinessState: "ready",
    });
  });

  it("returnerar null när hosten inte svarar ok", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    stubStatus({ ok: false });
    expect(await fetchPreviewHostReadinessVerdict("ps_1")).toBeNull();
  });

  it("returnerar null utan konfigurerad host", async () => {
    expect(await fetchPreviewHostReadinessVerdict("ps_1")).toBeNull();
  });
});
