/**
 * One session start per version (2026-11-11, chat ff62820f).
 *
 * The postchecks chain (stream instance) and the builder bootstrap
 * (`/preview-session` instance) used to start the host twice for the same
 * version, then each tore down the other's booting session. These tests use
 * TWO module instances of preview-session (two "Vercel instances") sharing
 * one fake Redis, which is what local dev — one process — cannot show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startPreviewHostSession = vi.hoisted(() => vi.fn());
const destroyPreviewHostSession = vi.hoisted(() => vi.fn());
const updatePreviewHostSession = vi.hoisted(() => vi.fn());
const fetchPreviewHostStatus = vi.hoisted(() => vi.fn());
const fetchPreviewHostReadinessVerdict = vi.hoisted(() => vi.fn());
const redisRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/data/redis", () => ({ getRedis: () => redisRef.current }));
vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({ logPreviewLifecycleTelemetry: vi.fn() }));
vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  destroyPreviewHostSession,
  fetchPreviewHostFilesManifest: vi.fn(async () => null),
  fetchPreviewHostReadinessVerdict,
  fetchPreviewHostStatus,
  patchPreviewHostSession: vi.fn(),
  startPreviewHostSession,
  updatePreviewHostSession,
}));
vi.mock("../export/project-scaffold", () => ({
  PLACEHOLDER_API_ROUTE: "export async function GET(){ return new Response('ok'); }",
  buildCompleteProject: vi.fn((files: unknown[]) => files),
}));
vi.mock("../export/project-scaffold-ui-reader", () => ({ collectRequiredUiComponents: vi.fn(() => []) }));
vi.mock("../autofix/repair-generated-files", () => ({ repairGeneratedFiles: vi.fn((files: unknown) => ({ files })) }));
vi.mock("@/lib/projects/project-env-vars", () => ({ getStoredProjectEnvVarMap: vi.fn(async () => ({})) }));

/** Just enough Redis for the session pointer CAS scripts and the start lock. */
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const key of keys) if (store.delete(key)) n += 1;
      return n;
    },
    async eval(script: string, numKeys: number, ...rest: string[]) {
      const keys = rest.slice(0, numKeys);
      const argv = rest.slice(numKeys);
      if (script.includes('redis.call("get", KEYS[1]) == ARGV[1]')) {
        if (store.get(keys[0]!) !== argv[0]) return 0;
        store.delete(keys[0]!);
        return 1;
      }
      const canonical = store.get(keys[0]!) ?? argv[2];
      const legacy = store.get(keys[1]!) ?? argv[2];
      if (canonical !== argv[0] || legacy !== argv[1]) return 0;
      if (script.includes("SETEX")) {
        store.set(keys[0]!, argv[4]!);
        store.delete(keys[1]!);
        return 1;
      }
      store.delete(keys[0]!);
      store.delete(keys[1]!);
      return 1;
    },
  };
}

const files = [{ path: "app/page.tsx", content: "export default function Page(){return <main/>}", language: "tsx" as const }];
const options = {
  chatId: "chat-lifecycle",
  versionIdForSession: "v1",
  filesRevisionForSession: "rev1",
  skipRepair: true,
  skipProjectScaffold: true,
  preparedEnvLocalContents: "",
};

function bootingVerdict(overrides: Record<string, unknown> = {}) {
  return {
    running: false,
    versionId: "v1",
    lifecycleToken: "life_A",
    mutationRevision: 1,
    installAttemptRevision: null,
    readinessState: "starting",
    hostStatus: "starting",
    httpReady: false,
    readinessError: null,
    regeneratedLockfile: null,
    ...overrides,
  };
}

async function loadInstance() {
  vi.resetModules();
  return import("./preview-session");
}

beforeEach(() => {
  process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
  redisRef.current = createFakeRedis();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  startPreviewHostSession.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      ok: true,
      previewSessionId: "ps_A",
      previewUrl: "https://preview-host.example.com/chat-lifecycle",
      lifecycleToken: "life_A",
      startOutcome: "recreated",
      mutationRevision: 1,
    };
  });
  destroyPreviewHostSession.mockResolvedValue({ ok: true, destroyed: true });
  fetchPreviewHostStatus.mockResolvedValue(null);
  fetchPreviewHostReadinessVerdict.mockResolvedValue(bootingVerdict());
});

afterEach(() => {
  delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  redisRef.current = null;
  vi.restoreAllMocks();
  for (const fn of [startPreviewHostSession, destroyPreviewHostSession, updatePreviewHostSession,
    fetchPreviewHostStatus, fetchPreviewHostReadinessVerdict]) fn.mockReset();
});

describe("preview lifecycle: one start per version across instances", () => {
  it("the stream chain and the builder bootstrap start the host ONCE; the second resumes the booting session", async () => {
    const chainInstance = await loadInstance();
    const bootstrapInstance = await loadInstance();

    const chain = chainInstance.startPreviewSession(files, options);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const bootstrap = bootstrapInstance.startPreviewSession(files, options);

    const [chainResult, bootstrapResult] = await Promise.all([chain, bootstrap]);

    expect(startPreviewHostSession).toHaveBeenCalledTimes(1);
    expect(destroyPreviewHostSession).not.toHaveBeenCalled();
    expect(chainResult).toMatchObject({ ok: true, result: { previewSessionId: "ps_A", lifecycleToken: "life_A", startOutcome: "recreated" } });
    expect(bootstrapResult).toMatchObject({
      ok: true,
      result: { previewSessionId: "ps_A", lifecycleToken: "life_A", startOutcome: "resumed", runtimeReady: false, filesRevision: "rev1" },
    });
    expect(fetchPreviewHostReadinessVerdict).toHaveBeenCalledWith("ps_A", expect.objectContaining({
      expectedVersionId: "v1",
      expectedLifecycleToken: "life_A",
    }));
  }, 10_000);

  it("a forced restart that waited for another instance's start resumes it instead of destroying it", async () => {
    const chainInstance = await loadInstance();
    const builderInstance = await loadInstance();

    const chain = chainInstance.startPreviewSession(files, options);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const forced = builderInstance.startPreviewSession(files, { ...options, forceRestart: true });

    const [, forcedResult] = await Promise.all([chain, forced]);

    expect(startPreviewHostSession).toHaveBeenCalledTimes(1);
    expect(destroyPreviewHostSession).not.toHaveBeenCalled();
    expect(forcedResult).toMatchObject({ ok: true, result: { previewSessionId: "ps_A", startOutcome: "resumed" } });
  }, 10_000);

  it("a second pass for the same version keeps a booting session (no destroy, no new machine)", async () => {
    const instance = await loadInstance();
    expect(await instance.startPreviewSession(files, options)).toMatchObject({ ok: true });
    const again = await instance.startPreviewSession(files, options);
    expect(again).toMatchObject({ ok: true, result: { previewSessionId: "ps_A", startOutcome: "resumed" } });
    expect(startPreviewHostSession).toHaveBeenCalledTimes(1);
    expect(destroyPreviewHostSession).not.toHaveBeenCalled();
  });

  it.each([
    ["failed readiness", bootingVerdict({ readinessState: "failed", hostStatus: "warm_project" })],
    ["boot-failure loop", bootingVerdict({ hostStatus: "error" })],
    ["hibernated", bootingVerdict({ readinessState: "ready", hostStatus: "hibernated" })],
    ["older host (no verdict)", null],
  ])("still destroys and re-pins on %s", async (_label, verdict) => {
    const instance = await loadInstance();
    expect(await instance.startPreviewSession(files, options)).toMatchObject({ ok: true });
    fetchPreviewHostReadinessVerdict.mockResolvedValue(verdict);
    const again = await instance.startPreviewSession(files, options);
    expect(again).toMatchObject({ ok: true });
    expect(destroyPreviewHostSession).toHaveBeenCalledTimes(1);
    expect(startPreviewHostSession).toHaveBeenCalledTimes(2);
  });

  it("an explicit forceRestart still tears down and starts once", async () => {
    const instance = await loadInstance();
    expect(await instance.startPreviewSession(files, options)).toMatchObject({ ok: true });
    const forced = await instance.startPreviewSession(files, { ...options, forceRestart: true });
    expect(forced).toMatchObject({ ok: true });
    expect(destroyPreviewHostSession).toHaveBeenCalledTimes(1);
    expect(startPreviewHostSession).toHaveBeenCalledTimes(2);
  });
});
