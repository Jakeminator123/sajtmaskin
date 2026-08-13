import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updatePreviewHostSession = vi.hoisted(() => vi.fn());
const startPreviewHostSession = vi.hoisted(() => vi.fn());
const destroyPreviewHostSession = vi.hoisted(() => vi.fn());
const patchPreviewHostSession = vi.hoisted(() => vi.fn());
const fetchPreviewHostFilesManifest = vi.hoisted(() => vi.fn());
const fetchPreviewHostStatus = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());
const logPreviewLifecycleTelemetry = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry,
}));

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => null,
}));

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  destroyPreviewHostSession,
  fetchPreviewHostFilesManifest,
  fetchPreviewHostStatus,
  patchPreviewHostSession,
  startPreviewHostSession,
  updatePreviewHostSession,
}));

vi.mock("../export/project-scaffold", () => ({
  PLACEHOLDER_API_ROUTE: "export async function GET(){ return new Response('ok'); }",
  buildCompleteProject,
}));

vi.mock("../export/project-scaffold-ui-reader", () => ({
  collectRequiredUiComponents: vi.fn(() => []),
}));

vi.mock("../autofix/repair-generated-files", () => ({
  repairGeneratedFiles: vi.fn((files) => ({ files })),
}));

vi.mock("@/lib/projects/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({
    STRIPE_SECRET_KEY: "sk_from_project",
  })),
}));

import {
  getActivePreviewSession,
  resetPreviewSessionStoreForTests,
  touchPreviewSessionAsync,
} from "./session-store";
import { hashPreviewFileContent } from "./preview-patch-plan";
import { startPreviewSession, tryPatchPreviewSession } from "./preview-session";

afterEach(() => {
  vi.restoreAllMocks();
  resetPreviewSessionStoreForTests();
  delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  delete process.env.SAJTMASKIN_PREVIEW_PATCH_LANE;
  updatePreviewHostSession.mockReset();
  startPreviewHostSession.mockReset();
  destroyPreviewHostSession.mockReset();
  patchPreviewHostSession.mockReset();
  fetchPreviewHostFilesManifest.mockReset();
  fetchPreviewHostStatus.mockReset();
  buildCompleteProject.mockReset();
  logPreviewLifecycleTelemetry.mockReset();
});

describe("startPreviewSession update path", () => {
  it("resends files when the same version id now has a different content revision", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-rewrite",
      previewUrl: "https://preview-host.example.com/chat-rewrite",
      startOutcome: "resumed",
    });
    await touchPreviewSessionAsync({
      chatId: "chat-rewrite",
      previewSessionId: "ps-rewrite",
      previewUrl: "https://preview-host.example.com/chat-rewrite",
      versionId: "version-rewritten-in-place",
      filesRevision: "revision-n",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [{ path: "app/page.tsx", content: "export default () => <main>N+1</main>", language: "typescript" }],
      {
        chatId: "chat-rewrite",
        versionIdForSession: "version-rewritten-in-place",
        filesRevisionForSession: "revision-n-plus-1",
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(fetchPreviewHostStatus).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(getActivePreviewSession("chat-rewrite")).toMatchObject({
      versionId: "version-rewritten-in-place",
      filesRevision: "revision-n-plus-1",
    });
  });

  it("regenerates .env.local when reusing an older preview-host session", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-1",
      startOutcome: "recreated",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-1",
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-1",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
        {
          path: ".env.local",
          content: "MODEL_KEY=from_model\nSTRIPE_SECRET_KEY=sk_from_model",
          language: "text",
        },
      ],
      {
        appProjectId: "proj-1",
        chatId: "chat-1",
        versionIdForSession: "version-new",
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.startOutcome).toBe("recreated");
    }
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(startPreviewHostSession).not.toHaveBeenCalled();

    const filesJson = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as
      | Record<string, string>
      | undefined;
    expect(filesJson?.[".env.local"]).toContain("MODEL_KEY=from_model");
    expect(filesJson?.[".env.local"]).toContain("STRIPE_SECRET_KEY=sk_from_model");
    expect(filesJson?.[".env.local"]).toContain("NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=proj-1");
  });

  it("never lets the pipeline-authored placeholder .env.local shadow user env-panel values", async () => {
    // Provenance regression (2026-07-09): the scaffold merge's own placeholder
    // `.env.local` (marker-headed) used to be passed as the "generated"
    // (highest-priority) layer, so a stale placeholder like
    // `STRIPE_SECRET_KEY=sk_test_placeholder…` OVERRODE the user's real value
    // from the env panel in the VM. The marker file must be dropped; the
    // user layer (mocked above as sk_from_project) must win.
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-3",
      startOutcome: "resumed",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-3",
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-3",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const pipelineEnvLocal = [
      "# Sajtmaskin — placeholder .env.local for local development (not production secrets)",
      "# Same keys as tier-2 preview runtime; override with real values when deploying.",
      "",
      "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real",
      "PIPELINE_ONLY_KEY=stale_pipeline_value",
    ].join("\n");

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
        { path: ".env.local", content: pipelineEnvLocal, language: "text" },
      ],
      {
        appProjectId: "proj-3",
        chatId: "chat-3",
        versionIdForSession: "version-new",
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    const filesJson = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as
      | Record<string, string>
      | undefined;
    expect(filesJson?.[".env.local"]).toContain("STRIPE_SECRET_KEY=sk_from_project");
    expect(filesJson?.[".env.local"]).not.toContain("sk_test_placeholder_preview_not_real");
    expect(filesJson?.[".env.local"]).not.toContain("PIPELINE_ONLY_KEY");
  });

  it("builds preview .env.local after scaffolding even when the persisted scope has no env artifact", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    buildCompleteProject.mockReturnValueOnce([
      {
        path: "app/page.tsx",
        content: "export default function Page(){return <main/>;}",
        language: "typescript",
      },
    ]);
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-2",
      startOutcome: "resumed",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-2",
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-2",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
      ],
      {
        appProjectId: "proj-2",
        chatId: "chat-2",
        versionIdForSession: "version-new",
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(buildCompleteProject).toHaveBeenCalledOnce();
    const filesJson = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as
      | Record<string, string>
      | undefined;
    expect(filesJson?.[".env.local"]).toContain("NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=proj-2");
    expect(filesJson?.[".env.local"]).toContain("STRIPE_SECRET_KEY=sk_from_project");
  });

  it("forceRestart destroys the prior preview-host session before starting fresh", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    destroyPreviewHostSession.mockResolvedValueOnce({ ok: true, destroyed: true });
    startPreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-new",
      previewUrl: "https://preview-host.example.com/chat-3",
      startOutcome: "recreated",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-3",
      previewSessionId: "ps-old",
      previewUrl: "https://preview-host.example.com/chat-3",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
      ],
      {
        chatId: "chat-3",
        versionIdForSession: "version-new",
        forceRestart: true,
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(destroyPreviewHostSession).toHaveBeenCalledWith({ previewSessionId: "ps-old" });
    expect(startPreviewHostSession).toHaveBeenCalledOnce();
  });
});

describe("startPreviewSession follow-up Fast Edit Lane", () => {
  const HOST_BASE = "https://preview-host.example.com";
  const PREVIEW_URL = "https://preview-host.example.com/chat-patch";
  const PAGE_V1 = "export default function Page(){return <main>Version ett</main>;}";
  const PAGE_V2 = "export default function Page(){return <main>Version tva</main>;}";
  const ABOUT_PAGE = "export default function About(){return <main>Om oss</main>;}";

  function file(path: string, content: string) {
    return { path, content, language: "typescript" as const };
  }

  function hashesOf(payload: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(payload).map(([path, content]) => [path, hashPreviewFileContent(content)]),
    );
  }

  async function runFollowUp(
    versionId: string,
    files: Array<{ path: string; content: string; language: "typescript" }>,
  ) {
    return startPreviewSession(files, {
      appProjectId: "proj-patch",
      chatId: "chat-patch",
      versionIdForSession: versionId,
      skipProjectScaffold: true,
      skipRepair: true,
    });
  }

  /**
   * Run one follow-up through the full-update path and return the exact payload
   * it pushed — that IS what the host would be holding afterwards, so hashing it
   * gives a realistic manifest (including the generated `.env.local`) for the
   * next follow-up to diff against.
   */
  async function primeLiveSession(
    baseVersionId: string,
    files: Array<{ path: string; content: string; language: "typescript" }>,
  ): Promise<Record<string, string>> {
    await touchPreviewSessionAsync({
      chatId: "chat-patch",
      previewSessionId: "ps-live",
      previewUrl: PREVIEW_URL,
      versionId: "version-seed",
      tier2Provider: "preview_host",
    });
    fetchPreviewHostFilesManifest.mockResolvedValueOnce(null);
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-live",
      previewUrl: PREVIEW_URL,
      startOutcome: "resumed",
    });
    await runFollowUp(baseVersionId, files);
    const payload = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as Record<
      string,
      string
    >;
    expect(payload).toBeTruthy();
    updatePreviewHostSession.mockReset();
    fetchPreviewHostFilesManifest.mockReset();
    logPreviewLifecycleTelemetry.mockReset();
    return payload;
  }

  function mockManifest(versionId: string, payload: Record<string, string>, running = true) {
    fetchPreviewHostFilesManifest.mockResolvedValue({
      previewSessionId: "ps-live",
      versionId,
      running,
      files: hashesOf(payload),
    });
  }

  function mockPatchOk(hostVersionId: string | null, patchMode = "patched") {
    patchPreviewHostSession.mockResolvedValue({
      ok: true,
      previewSessionId: "ps-live",
      previewUrl: PREVIEW_URL,
      startOutcome: "resumed",
      patchMode,
      patchReason: null,
      hostVersionId,
    });
  }

  function mockUpdateOk() {
    updatePreviewHostSession.mockResolvedValue({
      ok: true,
      previewSessionId: "ps-live",
      previewUrl: PREVIEW_URL,
      startOutcome: "resumed",
    });
  }

  beforeEach(() => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = HOST_BASE;
    process.env.SAJTMASKIN_PREVIEW_PATCH_LANE = "true";
  });

  it("patches only the changed and removed paths instead of a full update", async () => {
    const livePayload = await primeLiveSession("version-a", [
      file("app/page.tsx", PAGE_V1),
      file("app/about/page.tsx", ABOUT_PAGE),
    ]);
    mockManifest("version-a", livePayload);
    mockPatchOk("version-b");

    const result = await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(result.ok).toBe(true);
    expect(updatePreviewHostSession).not.toHaveBeenCalled();
    expect(patchPreviewHostSession).toHaveBeenCalledOnce();
    const patchArgs = patchPreviewHostSession.mock.calls[0]?.[0];
    expect(patchArgs.versionId).toBe("version-b");
    expect(patchArgs.expectedBaseVersionId).toBe("version-a");
    expect(patchArgs.files).toEqual({ "app/page.tsx": PAGE_V2 });
    expect(patchArgs.removedPaths).toEqual(["app/about/page.tsx"]);
    // Session pointer must advance so resume ("same chat+version -> reuse")
    // and /status keep agreeing with the host.
    expect(getActivePreviewSession("chat-patch")?.versionId).toBe("version-b");
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preview_followup_lane",
        lane: "patch",
        patchMode: "patched",
        versionId: "version-b",
        baseVersionId: "version-a",
        changedFiles: 1,
        removedPaths: 1,
      }),
    );
    if (result.ok) {
      expect(result.result.startOutcome).toBe("resumed");
      // A hot patch inherits the previous boot's receipt — never a per-version
      // runtime-ready claim (M#pv1 false-green guard).
      expect(result.result.runtimeReady).toBe(false);
    }
  });

  it("falls back to a full update when the host serves a different base version", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-someone-else", livePayload);
    mockUpdateOk();

    const result = await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(result.ok).toBe(true);
    expect(patchPreviewHostSession).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "host_version_mismatch" }),
    );
  });

  it("falls back to a full update when the host runtime is not running", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload, false);
    mockUpdateOk();

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(patchPreviewHostSession).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "runtime_not_running" }),
    );
  });

  it("falls back to a full update when a structural path changed", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    // Host holds a different .env.local than the one this follow-up would push
    // (e.g. the env panel changed): Next reads env at boot, so it must restart.
    mockManifest("version-a", { ...livePayload, ".env.local": "STALE_ENV=1" });
    mockUpdateOk();

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(patchPreviewHostSession).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "structural_change" }),
    );
  });

  it("falls back to a full update when the host manifest is unavailable (older host)", async () => {
    await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    fetchPreviewHostFilesManifest.mockResolvedValue(null);
    mockUpdateOk();

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(patchPreviewHostSession).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "manifest_unavailable" }),
    );
  });

  it("falls back to a full update when the host refuses or fails the patch", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    patchPreviewHostSession.mockResolvedValue({
      ok: false,
      message: "preview-host session advanced past the expected base version",
      retryable: false,
      baseMismatch: true,
    });
    mockUpdateOk();

    const result = await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(result.ok).toBe(true);
    expect(patchPreviewHostSession).toHaveBeenCalledOnce();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(getActivePreviewSession("chat-patch")?.versionId).toBe("version-b");
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "host_patch_failed" }),
    );
  });

  it("falls back to a full update when the host did not pin the new versionId", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    // Host answered 200 but its session still reports the OLD version: the
    // version binding is not guaranteed, so the full update must re-pin it.
    mockPatchOk("version-a");
    mockUpdateOk();

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(patchPreviewHostSession).toHaveBeenCalledOnce();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    // The update path stays the authority for the binding: it sends the new
    // version and it is what advances the app-side session pointer.
    expect(updatePreviewHostSession.mock.calls[0]?.[0]?.versionId).toBe("version-b");
    expect(getActivePreviewSession("chat-patch")?.versionId).toBe("version-b");
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "host_version_not_recorded" }),
    );
  });

  it("falls back to a full update when the host echoes NO versionId at all", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    // Host answered 200 but without any versionId echo (older host build or a
    // stripped field). Silence is NOT confirmation: the strict binding guard
    // must treat it like a mismatch and let the full update re-pin.
    mockPatchOk(null);
    mockUpdateOk();

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(patchPreviewHostSession).toHaveBeenCalledOnce();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(getActivePreviewSession("chat-patch")?.versionId).toBe("version-b");
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: "update",
        reason: "host_version_not_recorded",
        detail: "host=none",
      }),
    );
  });

  // Version/revision binding: preview session + versionId + the revision that
  // was actually patched must stay bound. A VM that never received the patch
  // can never "approve" (report ready for) the new version.
  it("resumes a patched version only while the host still reports that exact version", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    mockPatchOk("version-b");
    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);
    expect(getActivePreviewSession("chat-patch")?.versionId).toBe("version-b");

    // Reopen/bootstrap for the same version -> resume branch. The host confirms
    // BOTH the version and readiness: since the readiness contract landed,
    // liveness alone is no longer a runtime-ready receipt (an unknown or
    // `starting` verdict is pending, never success).
    fetchPreviewHostStatus.mockResolvedValueOnce({
      previewSessionId: "ps-live",
      primaryUrl: PREVIEW_URL,
      readinessState: "ready",
      httpReady: true,
      readinessError: null,
      regeneratedLockfile: null,
    });
    const reopened = await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(fetchPreviewHostStatus).toHaveBeenCalledWith("ps-live", {
      expectedVersionId: "version-b",
    });
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.result.startOutcome).toBe("resumed");
      expect(reopened.result.runtimeReady).toBe(true);
    }
    expect(startPreviewHostSession).not.toHaveBeenCalled();
  });

  it("never lets a stale VM approve the patched version — a mismatched host forces a rebuild", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    mockPatchOk("version-b");
    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    // The host is serving some other revision, so the version-pinned status
    // check returns null (see fetchPreviewHostStatus version pinning).
    fetchPreviewHostStatus.mockResolvedValueOnce(null);
    destroyPreviewHostSession.mockResolvedValueOnce({ ok: true, destroyed: true });
    startPreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-fresh",
      previewUrl: PREVIEW_URL,
      startOutcome: "recreated",
    });

    const reopened = await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      // No stale "ready" receipt: the session is rebuilt instead of resumed.
      expect(reopened.result.startOutcome).toBe("recreated");
      expect(reopened.result.runtimeReady).toBe(false);
    }
    expect(destroyPreviewHostSession).toHaveBeenCalledWith({ previewSessionId: "ps-live" });
    expect(startPreviewHostSession).toHaveBeenCalledOnce();
  });

  it("never touches the host manifest when the patch lane flag is off", async () => {
    const livePayload = await primeLiveSession("version-a", [file("app/page.tsx", PAGE_V1)]);
    mockManifest("version-a", livePayload);
    mockUpdateOk();
    delete process.env.SAJTMASKIN_PREVIEW_PATCH_LANE;

    await runFollowUp("version-b", [file("app/page.tsx", PAGE_V2)]);

    expect(fetchPreviewHostFilesManifest).not.toHaveBeenCalled();
    expect(patchPreviewHostSession).not.toHaveBeenCalled();
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ lane: "update", reason: "patch_lane_disabled" }),
    );
  });
});

// Strikt versionsbindning: patchvägen får bara röra en session vars pekare ÄR
// den bas diffen härleddes ur. Både "pekar på en annan version" och "har ingen
// version alls" är samma sak för en partiell patch — vi vet inte vad som ligger
// i workspacet, och att merga in en delmängd ger ett hybrid-filset med en
// preview-URL som ser giltig ut.
describe("tryPatchPreviewSession — strikt bas-versionsbindning", () => {
  beforeEach(() => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    process.env.SAJTMASKIN_PREVIEW_PATCH_LANE = "true";
  });

  it("patchar när den lagrade pekaren är exakt den förväntade basen", async () => {
    await touchPreviewSessionAsync({
      chatId: "chat-strict",
      previewSessionId: "ps-strict",
      previewUrl: "https://preview-host.example.com/chat-strict",
      versionId: "version-base",
      tier2Provider: "preview_host",
    });
    patchPreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-strict",
      previewUrl: "https://preview-host.example.com/chat-strict",
      hostVersionId: "version-next",
      patchMode: "patched",
    });

    const result = await tryPatchPreviewSession({
      chatId: "chat-strict",
      versionId: "version-next",
      filesRevision: "revision-next",
      changedFiles: { "app/page.tsx": "x" },
      expectedBaseVersionId: "version-base",
    });

    expect(result.ok).toBe(true);
    expect(patchPreviewHostSession).toHaveBeenCalledOnce();
    expect(getActivePreviewSession("chat-strict")).toMatchObject({
      versionId: "version-next",
      filesRevision: "revision-next",
    });
  });

  it("vägrar när den lagrade pekaren är en annan version", async () => {
    await touchPreviewSessionAsync({
      chatId: "chat-strict",
      previewSessionId: "ps-strict",
      previewUrl: "https://preview-host.example.com/chat-strict",
      versionId: "version-other",
      tier2Provider: "preview_host",
    });

    const result = await tryPatchPreviewSession({
      chatId: "chat-strict",
      versionId: "version-next",
      changedFiles: { "app/page.tsx": "x" },
      expectedBaseVersionId: "version-base",
    });

    expect(result).toEqual({ ok: false, reason: "base_mismatch" });
    expect(patchPreviewHostSession).not.toHaveBeenCalled();
  });

  it("vägrar när sessionen saknar version helt — okänd mark är inte en träff", async () => {
    await touchPreviewSessionAsync({
      chatId: "chat-strict",
      previewSessionId: "ps-strict",
      previewUrl: "https://preview-host.example.com/chat-strict",
      versionId: "",
      tier2Provider: "preview_host",
    });

    const result = await tryPatchPreviewSession({
      chatId: "chat-strict",
      versionId: "version-next",
      changedFiles: { "app/page.tsx": "x" },
      expectedBaseVersionId: "version-base",
    });

    expect(result).toEqual({ ok: false, reason: "base_mismatch" });
    expect(patchPreviewHostSession).not.toHaveBeenCalled();
  });
});
