/**
 * Regression: destroy removes the chat-scoped workspace after releasing the
 * persistent store lock. A concurrent start used to create the new session and
 * workspace in that gap, after which the stale destroy deleted the new files.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-lifecycle-race-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.PREVIEW_HOST_BASE_URL = "http://127.0.0.1";
process.env.HOST = "127.0.0.1";

const require = createRequire(import.meta.url);
const runtime = require("../src/runtime.js");
const store = require("../src/store.js");
const { withChatLifecycleLock } = require("../src/session-lifecycle.js");
const chatId = "race-chat";
const workspaceDir = runtime.__testing.workspaceDirForChat(chatId);
const oldSession = {
  sessionId: "session-old",
  previewSessionId: "ps-shared",
  lifecycleToken: "life-old",
  chatId,
  versionId: "v-old",
  previewUrl: `http://127.0.0.1/${chatId}`,
  status: "running",
  lastAction: "start",
  changeClass: "fresh",
  startOutcome: "fresh",
  filesJson: { "app/page.tsx": "old" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
};
store.writeStoreAtomicSync({
  sessions: { [oldSession.sessionId]: oldSession },
  logs: {},
  previewSessionToSession: { [oldSession.previewSessionId]: oldSession.sessionId },
  prewarmLeases: {},
});
mkdirSync(workspaceDir, { recursive: true });
writeFileSync(join(workspaceDir, "owner.txt"), "old", "utf8");

let activeStopGate = null;
function armStopGate() {
  let release;
  let markEntered;
  const entered = new Promise((resolve) => {
    markEntered = resolve;
  });
  activeStopGate = {
    entered,
    release: () => release(),
    wait: new Promise((resolve) => {
      release = resolve;
    }),
    markEntered,
  };
  return activeStopGate;
}
runtime.stopRuntimeForSession = async () => {
  const gate = activeStopGate;
  activeStopGate = null;
  if (!gate) return;
  gate.markEntered();
  await gate.wait;
};
runtime.destroyChatWorkspace = async () => {
  rmSync(workspaceDir, { recursive: true, force: true });
};
runtime.queueRuntimeBoot = () => {
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(join(workspaceDir, "owner.txt"), "new", "utf8");
};

const { createServer } = require("../src/server/create-server.js");
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

function post(pathname, body) {
  return fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`  OK    ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

try {
  const firstStopGate = armStopGate();
  const destroyPromise = post("/preview/session/destroy", {
    previewSessionId: oldSession.previewSessionId,
    lifecycleToken: oldSession.lifecycleToken,
  });
  await firstStopGate.entered;

  let startSettled = false;
  const startPromise = post("/preview/session/start", {
    chatId,
    versionId: "v-new",
    changeClass: "fresh",
    filesJson: { "app/page.tsx": "new" },
  }).then(async (response) => {
    startSettled = true;
    return { response, body: await response.json() };
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  check("start waits while destroy owns the chat lifecycle", startSettled === false);

  firstStopGate.release();
  const [destroyResponse, started] = await Promise.all([destroyPromise, startPromise]);
  check("destroy completed", destroyResponse.status === 200);
  check("new start completed", started.response.status === 201);
  check(
    "new start receives a fresh lifecycle token",
    typeof started.body.lifecycleToken === "string" &&
      started.body.lifecycleToken.length > 0 &&
      started.body.lifecycleToken !== oldSession.lifecycleToken,
  );
  check(
    "stale cleanup did not erase the new workspace",
    readFileSync(join(workspaceDir, "owner.txt"), "utf8") === "new",
  );

  const stale = await post("/preview/session/destroy", {
    previewSessionId: started.body.previewSessionId,
    lifecycleToken: oldSession.lifecycleToken,
  });
  check("stale destroy is fenced", stale.status === 409);
  check(
    "stale destroy keeps the new session",
    Boolean(store.readStoreSync().sessions[started.body.sessionId]),
  );
  check(
    "stale destroy keeps the new workspace",
    readFileSync(join(workspaceDir, "owner.txt"), "utf8") === "new",
  );

  const stateBeforeStaleMutations = store.readStoreSync().sessions[started.body.sessionId];
  const staleUpdate = await post("/preview/session/update", {
    previewSessionId: started.body.previewSessionId,
    lifecycleToken: oldSession.lifecycleToken,
    versionId: "v-stale-update",
    replaceFiles: true,
    filesJson: { "app/page.tsx": "stale update" },
  });
  check("stale update is fenced", staleUpdate.status === 409);
  const stalePatch = await post("/preview/session/patch", {
    previewSessionId: started.body.previewSessionId,
    lifecycleToken: oldSession.lifecycleToken,
    versionId: "v-stale-patch",
    files: { "app/page.tsx": "stale patch" },
  });
  check("stale patch is fenced", stalePatch.status === 409);
  const staleHibernate = await post("/preview/session/hibernate", {
    previewSessionId: started.body.previewSessionId,
    lifecycleToken: oldSession.lifecycleToken,
  });
  check("stale hibernate is fenced", staleHibernate.status === 409);
  const stateAfterStaleMutations = store.readStoreSync().sessions[started.body.sessionId];
  check(
    "stale mutations leave the new lifecycle unchanged",
    stateAfterStaleMutations?.lifecycleToken === started.body.lifecycleToken &&
      stateAfterStaleMutations?.versionId === stateBeforeStaleMutations?.versionId &&
      stateAfterStaleMutations?.status === stateBeforeStaleMutations?.status,
  );

  const adminStopGate = armStopGate();
  const destroyAllPromise = post("/admin/destroy-all", {});
  await adminStopGate.entered;
  let startAfterAdminSettled = false;
  const startAfterAdminPromise = post("/preview/session/start", {
    chatId,
    versionId: "v-after-admin",
    changeClass: "fresh",
    filesJson: { "app/page.tsx": "after admin" },
  }).then(async (response) => {
    startAfterAdminSettled = true;
    return { response, body: await response.json() };
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  check("start waits while destroy-all owns the chat lifecycle", startAfterAdminSettled === false);
  adminStopGate.release();
  const [destroyAll, afterAdmin] = await Promise.all([
    destroyAllPromise,
    startAfterAdminPromise,
  ]);
  check("destroy-all completed", destroyAll.status === 200);
  check("start after destroy-all completed", afterAdmin.response.status === 201);
  check(
    "destroy-all did not erase the replacement workspace",
    existsSync(join(workspaceDir, "owner.txt")) &&
      readFileSync(join(workspaceDir, "owner.txt"), "utf8") === "new",
  );

  const bootSession = store.readStoreSync().sessions[afterAdmin.body.sessionId];
  const bootFiles = {
    "package.json": JSON.stringify({ name: "lifecycle-race", private: true }),
    "app/page.tsx": "boot lifecycle",
  };
  await store.withStoreLock((data) => {
    data.sessions[afterAdmin.body.sessionId].filesJson = bootFiles;
    return null;
  });
  bootSession.filesJson = bootFiles;
  let releaseInstall;
  let markInstallEntered;
  const installEntered = new Promise((resolve) => {
    markInstallEntered = resolve;
  });
  runtime.__testing.setBootInstallRunnersForTesting({
    installRunner: async () => {
      markInstallEntered();
      await new Promise((resolve) => {
        releaseInstall = resolve;
      });
      return {
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "",
        usedFallback: false,
        peerConflictDetected: false,
      };
    },
  });
  const inflightBoot = runtime.ensureRuntimeForChat(chatId);
  await installEntered;
  const bootDestroy = await post("/preview/session/destroy", {
    previewSessionId: afterAdmin.body.previewSessionId,
    lifecycleToken: afterAdmin.body.lifecycleToken,
  });
  check("destroy wins while an existing bootChain is installing", bootDestroy.status === 200);
  releaseInstall();
  await inflightBoot.catch(() => null);
  check(
    "superseded bootChain cannot recreate the destroyed workspace",
    existsSync(workspaceDir) === false,
  );
  check(
    "superseded bootChain cannot restore the destroyed session",
    !store.readStoreSync().sessions[afterAdmin.body.sessionId],
  );
  runtime.__testing.setBootInstallRunnersForTesting();

  const staleForCleanup = await post("/preview/session/start", {
    chatId,
    versionId: "v-cleanup-old",
    changeClass: "fresh",
    filesJson: { "app/page.tsx": "cleanup old" },
  }).then(async (response) => ({ response, body: await response.json() }));
  await store.withStoreLock((data) => {
    data.sessions[staleForCleanup.body.sessionId].sessionExpiresAt = new Date(0).toISOString();
    return null;
  });
  let releaseWorkspaceSweep;
  let markCleanupSnapshotted;
  const cleanupSnapshotted = new Promise((resolve) => {
    markCleanupSnapshotted = resolve;
  });
  runtime.__testing.setBeforeWorkspaceSweepForTesting(async () => {
    markCleanupSnapshotted();
    await new Promise((resolve) => {
      releaseWorkspaceSweep = resolve;
    });
  });
  const cleanupPromise = runtime.cleanupPreviewHostStorage();
  await cleanupSnapshotted;
  const replacementDuringCleanup = await post("/preview/session/start", {
    chatId,
    versionId: "v-cleanup-new",
    changeClass: "fresh",
    filesJson: { "app/page.tsx": "cleanup new" },
  }).then(async (response) => ({ response, body: await response.json() }));
  releaseWorkspaceSweep();
  await cleanupPromise;
  check("replacement start completes during a stale cleanup snapshot", replacementDuringCleanup.response.status === 201);
  check(
    "storage cleanup keeps the replacement workspace",
    existsSync(join(workspaceDir, "owner.txt")) &&
      readFileSync(join(workspaceDir, "owner.txt"), "utf8") === "new",
  );
  check(
    "storage cleanup keeps the replacement lifecycle",
    store.readStoreSync().sessions[replacementDuringCleanup.body.sessionId]?.lifecycleToken ===
      replacementDuringCleanup.body.lifecycleToken,
  );
  runtime.__testing.setBeforeWorkspaceSweepForTesting();

  const lifecycleSessionId = replacementDuringCleanup.body.sessionId;
  const lifecyclePreviewSessionId = replacementDuringCleanup.body.previewSessionId;
  await store.withStoreLock((data) => {
    Object.assign(data.sessions[lifecycleSessionId], {
      versionId: "v-same",
      lifecycleToken: "life-probe-old",
      readinessState: "starting",
      readinessError: null,
      status: "running",
    });
    return null;
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId: lifecycleSessionId,
    previewSessionId: lifecyclePreviewSessionId,
    lifecycleToken: "life-probe-old",
    runtimePort: 4999,
    running: true,
    lastActivityAt: Date.now(),
  });

  const originalFetch = globalThis.fetch;
  let releaseProbeFetch;
  let markProbeFetchEntered;
  const probeFetchEntered = new Promise((resolve) => {
    markProbeFetchEntered = resolve;
  });
  globalThis.fetch = async () => {
    markProbeFetchEntered();
    await new Promise((resolve) => {
      releaseProbeFetch = resolve;
    });
    return new Response(
      "<!doctype html><html><body><main>Current preview rendered enough meaningful text for readiness.</main></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };
  try {
    const staleProbe = runtime.__testing.probeReadinessAfterPatch({
      chatId,
      sessionId: lifecycleSessionId,
      previewSessionId: lifecyclePreviewSessionId,
      versionId: "v-same",
      lifecycleToken: "life-probe-old",
    });
    await probeFetchEntered;
    await store.withStoreLock((data) => {
      Object.assign(data.sessions[lifecycleSessionId], {
        lifecycleToken: "life-probe-new",
        readinessState: "starting",
        readinessError: null,
      });
      return null;
    });
    releaseProbeFetch();
    await staleProbe;
  } finally {
    globalThis.fetch = originalFetch;
  }
  check(
    "a cached patch probe from lifecycle N cannot stamp same-version lifecycle N+1",
    store.readStoreSync().sessions[lifecycleSessionId]?.lifecycleToken === "life-probe-new" &&
      store.readStoreSync().sessions[lifecycleSessionId]?.readinessState === "starting",
  );

  await store.withStoreLock((data) => {
    Object.assign(data.sessions[lifecycleSessionId], {
      lifecycleToken: "life-idle-old",
      readinessState: "ready",
      status: "running",
    });
    return null;
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId: lifecycleSessionId,
    previewSessionId: lifecyclePreviewSessionId,
    lifecycleToken: "life-idle-old",
    runtimePort: 4999,
    running: true,
    lastActivityAt: 0,
  });
  let releaseIdleSnapshot;
  let markIdleSnapshot;
  const idleSnapshotTaken = new Promise((resolve) => {
    markIdleSnapshot = resolve;
  });
  runtime.__testing.setBeforeIdleLifecycleCheckForTesting(async () => {
    markIdleSnapshot();
    await new Promise((resolve) => {
      releaseIdleSnapshot = resolve;
    });
  });
  let idleSweepSettled = false;
  const idleSweepPromise = runtime.sweepIdleRuntimes(Date.now()).then((result) => {
    idleSweepSettled = true;
    return result;
  });
  await idleSnapshotTaken;
  check("idle sweep pauses after snapshot before lifecycle mutation", idleSweepSettled === false);
  await withChatLifecycleLock(chatId, async () => {
    await store.withStoreLock((data) => {
      Object.assign(data.sessions[lifecycleSessionId], {
        lifecycleToken: "life-idle-new",
        readinessState: "ready",
        status: "running",
      });
      return null;
    });
    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId: lifecycleSessionId,
      previewSessionId: lifecyclePreviewSessionId,
      lifecycleToken: "life-idle-new",
      runtimePort: 5000,
      running: true,
      lastActivityAt: Date.now(),
    });
  });
  releaseIdleSnapshot();
  await idleSweepPromise;
  check(
    "stale idle snapshot cannot hibernate or stop the replacement lifecycle",
    store.readStoreSync().sessions[lifecycleSessionId]?.status === "running" &&
      store.readStoreSync().sessions[lifecycleSessionId]?.lifecycleToken === "life-idle-new" &&
      runtime.getRuntimeStateForChat(chatId).running === true,
  );
  runtime.__testing.setBeforeIdleLifecycleCheckForTesting();
  runtime.__testing.clearRuntimeStateForTesting(chatId, lifecycleSessionId);

  await store.withStoreLock((data) => {
    delete data.sessions[replacementDuringCleanup.body.sessionId].lifecycleToken;
    return null;
  });
  const legacyUpdate = await post("/preview/session/update", {
    previewSessionId: replacementDuringCleanup.body.previewSessionId,
    versionId: "v-legacy-update",
    replaceFiles: true,
    filesJson: { "app/page.tsx": "legacy update" },
  });
  check("persisted tokenless session still accepts a tokenless update", legacyUpdate.status === 200);
  const legacyHibernate = await post("/preview/session/hibernate", {
    previewSessionId: replacementDuringCleanup.body.previewSessionId,
  });
  check(
    "persisted tokenless session still accepts a tokenless hibernate",
    legacyHibernate.status === 200,
  );
} finally {
  runtime.__testing.setBootInstallRunnersForTesting();
  runtime.__testing.setBeforeWorkspaceSweepForTesting();
  runtime.__testing.setBeforeIdleLifecycleCheckForTesting();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`[test-session-lifecycle-race] FAILED - ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("[test-session-lifecycle-race] All guards green.");
