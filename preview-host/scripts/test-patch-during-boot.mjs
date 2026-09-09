/**
 * Regression: same-version file rewrite (image repair / files_revision bump)
 * while the first boot is still in flight must hot-write the new files and
 * must NOT queue a second full boot.
 *
 * Proven 2026-09-08, chat 4a2aa301-c337-44e6-9939-9b65a3f872a5: /update during
 * npm install went ready → stop → iframe reload → second boot (+13s).
 *
 *   node scripts/test-patch-during-boot.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-patch-during-boot-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";

const require = createRequire(import.meta.url);
const store = require("../src/store.js");
const runtime = require("../src/runtime.js");

const PAGE_V1 = "export default function Page(){return <main>broken unsplash</main>;}";
const PAGE_V2 = "export default function Page(){return <main>fixed unsplash</main>;}";
const chatId = "chat-boot-patch";
const sessionId = "session-boot-patch";
const previewSessionId = "ps-boot-patch";
const lifecycleToken = "life-boot-patch";
const versionId = "version-v1";

function seedSession(filesJson, extras = {}) {
  const now = new Date().toISOString();
  const session = {
    sessionId,
    previewSessionId,
    lifecycleToken,
    chatId,
    versionId,
    previewUrl: `http://127.0.0.1/${chatId}`,
    status: "starting",
    lastAction: "start",
    changeClass: "fresh",
    startOutcome: "fresh",
    readinessState: "starting",
    readinessError: null,
    mutationRevision: 1,
    filesJson,
    createdAt: now,
    updatedAt: now,
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...extras,
  };
  store.writeStoreAtomicSync({
    sessions: { [sessionId]: session },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  return session;
}

function workspacePage() {
  return readFileSync(join(runtime.__testing.workspaceDirForChat(chatId), "app/page.tsx"), "utf8");
}

try {
  // 1) Same-version rewrite while booting: write files, do not queue restart.
  {
    seedSession({
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
    });
    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      running: false,
      booting: true,
    });
    runtime.__testing.setBootRunnerForTesting(async () => ({ runtimePort: 9 }));
    runtime.__testing.takeRestartBootsQueuedForTesting();

    const result = runtime.applyRuntimePatch(chatId, {
      files: { "app/page.tsx": PAGE_V2 },
      removedPaths: [],
      versionId,
      previousVersionId: versionId,
      mutationRevision: 2,
      expectedPreviousMutationRevision: 1,
    });

    assert.equal(result.mode, "patched");
    assert.equal(result.reason, "boot_in_flight");
    assert.equal(
      runtime.__testing.takeRestartBootsQueuedForTesting(),
      0,
      "same-version patch during boot must not queue a second full boot",
    );
    assert.equal(workspacePage(), PAGE_V2, "workspace must hold the rewritten file");
    runtime.__testing.setBootRunnerForTesting(null);
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
  }

  // 2) Dead / not-booting runtime still queues a boot (do not leave files
  //    on disk with no process).
  {
    seedSession({
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
    });
    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      running: false,
      booting: false,
    });
    runtime.__testing.setBootRunnerForTesting(async () => ({ runtimePort: 9 }));
    runtime.__testing.takeRestartBootsQueuedForTesting();

    const result = runtime.applyRuntimePatch(chatId, {
      files: { "app/page.tsx": PAGE_V2 },
      removedPaths: [],
      versionId,
      previousVersionId: versionId,
      mutationRevision: 2,
      expectedPreviousMutationRevision: 1,
    });

    assert.equal(result.mode, "booted");
    assert.equal(result.reason, "runtime_not_running");
    assert.equal(
      runtime.__testing.takeRestartBootsQueuedForTesting(),
      1,
      "a dead runtime must still get a boot from the merged filesJson",
    );
    runtime.__testing.setBootRunnerForTesting(null);
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
  }

  // 3) Follow-up to a NEW versionId while booting still restarts (FEL-4).
  {
    seedSession({
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
    });
    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      running: false,
      booting: true,
    });
    runtime.__testing.setBootRunnerForTesting(async () => ({ runtimePort: 9 }));
    runtime.__testing.takeRestartBootsQueuedForTesting();

    const result = runtime.applyRuntimePatch(chatId, {
      files: { "app/page.tsx": PAGE_V2 },
      removedPaths: [],
      versionId: "version-v2",
      previousVersionId: versionId,
      mutationRevision: 2,
      expectedPreviousMutationRevision: 1,
    });

    assert.equal(result.mode, "booted");
    assert.equal(result.reason, "runtime_not_running");
    assert.equal(
      runtime.__testing.takeRestartBootsQueuedForTesting(),
      1,
      "a new versionId during boot must still force a restart boot",
    );
    runtime.__testing.setBootRunnerForTesting(null);
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
  }

  // 4) In-flight boot must adopt a same-version patch (mutationRevision
  //    advanced, lastAction=patch) instead of throwing PREVIEW_LIFECYCLE_SUPERSEDED.
  {
    const bootSnapshot = seedSession({
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
    });
    const patchedStore = store.readStoreSync();
    patchedStore.sessions[sessionId].mutationRevision = 2;
    patchedStore.sessions[sessionId].lastAction = "patch";
    patchedStore.sessions[sessionId].filesJson = {
      ...patchedStore.sessions[sessionId].filesJson,
      "app/page.tsx": PAGE_V2,
    };
    store.writeStoreAtomicSync(patchedStore);

    const adopted = runtime.__testing.assertCurrentSessionLifecycle(bootSnapshot);
    assert.equal(adopted.mutationRevision, 2);
    assert.equal(adopted.lastAction, "patch");
    assert.equal(adopted.filesJson["app/page.tsx"], PAGE_V2);
    assert.equal(adopted.lifecycleToken, lifecycleToken);
    assert.equal(adopted.versionId, versionId);

    assert.throws(
      () =>
        runtime.__testing.assertCurrentSessionLifecycle({
          ...bootSnapshot,
          lifecycleToken: "life-other",
        }),
      (err) => err && err.code === "PREVIEW_LIFECYCLE_SUPERSEDED",
    );
    assert.throws(
      () =>
        runtime.__testing.assertCurrentSessionLifecycle({
          ...bootSnapshot,
          versionId: "version-other",
        }),
      (err) => err && err.code === "PREVIEW_LIFECYCLE_SUPERSEDED",
    );
  }

  // 5) boot_in_flight must not start a readiness probe against the persisted
  //    previous-runtime port. The in-flight boot owns readiness; a late
  //    waitForReady on 4293 while the new child binds 4294 used to stamp
  //    `failed` after the boot already wrote `ready`.
  {
    const { once } = await import("node:events");
    seedSession(
      {
        "package.json": JSON.stringify({ name: "boot-patch", private: true }),
        "app/page.tsx": PAGE_V1,
      },
      { runtimePort: 4293, readinessState: "starting" },
    );
    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      running: false,
      booting: true,
    });
    runtime.__testing.setBootRunnerForTesting(async () => ({ runtimePort: 4294 }));
    runtime.__testing.takeRestartBootsQueuedForTesting();

    const probeCalls = [];
    runtime.probeReadinessAfterPatch = async (args) => {
      probeCalls.push(args);
    };
    runtime.queueRuntimeBoot = () => {};
    const { createServer } = require("../src/server/create-server.js");
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const patched = await fetch(`${baseUrl}/preview/session/patch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          previewSessionId,
          lifecycleToken,
          versionId,
          expectedBaseVersionId: versionId,
          files: { "app/page.tsx": PAGE_V2 },
        }),
      });
      const body = await patched.json();
      assert.equal(patched.status, 200, body.message ?? "patch should succeed");
      assert.equal(body.patchMode, "patched");
      assert.equal(body.patchReason, "boot_in_flight");
      assert.equal(probeCalls.length, 0, "route must not start a probe during boot_in_flight");

      const readyStamp = store.readStoreSync();
      readyStamp.sessions[sessionId].readinessState = "ready";
      readyStamp.sessions[sessionId].readinessError = null;
      store.writeStoreAtomicSync(readyStamp);
      const afterPatch = readyStamp.sessions[sessionId];

      const originalFetch = globalThis.fetch;
      let fetchHits = 0;
      globalThis.fetch = async () => {
        fetchHits += 1;
        throw new Error("stale previous-runtime port must not be probed");
      };
      try {
        const startedAt = Date.now();
        await runtime.__testing.probeReadinessAfterPatch({
          chatId,
          sessionId,
          previewSessionId,
          versionId,
          lifecycleToken,
          mutationRevision: afterPatch.mutationRevision,
        });
        assert.ok(Date.now() - startedAt < 1000, "probe must return immediately while booting");
        assert.equal(fetchHits, 0, "probe must not hit the persisted previous-runtime port");
      } finally {
        globalThis.fetch = originalFetch;
      }

      const afterProbe = store.readStoreSync().sessions[sessionId];
      assert.equal(
        afterProbe.readinessState,
        "ready",
        "boot's own ready stamp must survive a skipped boot_in_flight probe",
      );
      assert.equal(afterProbe.readinessError, null);
    } finally {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }

    runtime.__testing.setBootRunnerForTesting(null);
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
  }

  // 6) Bugbot #1314: after-install refresh must not rewrite the workspace on
  //    a plain boot (that wiped next.config basePath). A mid-install
  //    same-version adopt writes only the diff and re-injects basePath.
  {
    const { existsSync, writeFileSync: writeFile } = await import("node:fs");
    const workspaceDir = runtime.__testing.workspaceDirForChat(chatId);
    const nextConfigPath = join(workspaceDir, "next.config.ts");
    const lockPath = join(workspaceDir, "package-lock.json");
    const nextConfigSource = [
      "import type { NextConfig } from \"next\";",
      "const config: NextConfig = { reactStrictMode: true };",
      "export default config;",
      "",
    ].join("\n");
    const filesBefore = {
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
      "next.config.ts": nextConfigSource,
    };

    runtime.__testing.writeFilesIntoWorkspace(workspaceDir, filesBefore);
    const injected = runtime.__testing.patchNextConfigForPreviewBasePath(workspaceDir);
    assert.equal(injected.applied, true);
    const configAfterInject = readFileSync(nextConfigPath, "utf8");
    assert.match(configAfterInject, /SAJTMASKIN_PREVIEW_BASE_PATH/);
    writeFile(lockPath, "{\"name\":\"npm-regenerated\"}\n", "utf8");
    writeFile(nextConfigPath, `${configAfterInject}\n/* install-was-here */\n`, "utf8");

    const bootSnapshot = {
      sessionId,
      chatId,
      lifecycleToken,
      versionId,
      mutationRevision: 1,
      lastAction: "start",
      filesJson: filesBefore,
    };
    const noPatch = runtime.__testing.refreshWorkspaceAfterAdoptedPatch(
      chatId,
      workspaceDir,
      bootSnapshot,
      bootSnapshot,
    );
    assert.equal(noPatch.rewritten, false, "plain boot must not rewrite after install");
    const configAfterNoPatch = readFileSync(nextConfigPath, "utf8");
    assert.match(configAfterNoPatch, /SAJTMASKIN_PREVIEW_BASE_PATH/);
    assert.match(configAfterNoPatch, /install-was-here/);
    assert.equal(readFileSync(lockPath, "utf8"), "{\"name\":\"npm-regenerated\"}\n");

    const adopted = {
      ...bootSnapshot,
      mutationRevision: 2,
      lastAction: "patch",
      filesJson: {
        ...filesBefore,
        "app/page.tsx": PAGE_V2,
        "package-lock.json": "{\"name\":\"stale-from-filesJson\"}\n",
      },
    };
    const patched = runtime.__testing.refreshWorkspaceAfterAdoptedPatch(
      chatId,
      workspaceDir,
      bootSnapshot,
      adopted,
    );
    assert.equal(patched.rewritten, true);
    assert.equal(patched.changedFiles, 1);
    assert.equal(readFileSync(join(workspaceDir, "app/page.tsx"), "utf8"), PAGE_V2);
    const configAfterAdopt = readFileSync(nextConfigPath, "utf8");
    assert.match(
      configAfterAdopt,
      /SAJTMASKIN_PREVIEW_BASE_PATH/,
      "mid-install adopt must re-apply basePath after the rewrite",
    );
    assert.equal(
      readFileSync(lockPath, "utf8"),
      "{\"name\":\"npm-regenerated\"}\n",
      "npm-regenerated lockfile must not be overwritten from filesJson",
    );

    runtime.__testing.writeFilesIntoWorkspace(workspaceDir, {
      "package.json": filesBefore["package.json"],
      "app/page.tsx": PAGE_V2,
      "next.config.ts": nextConfigSource,
    });
    assert.equal(
      existsSync(lockPath),
      true,
      "writeFilesIntoWorkspace must not delete a lockfile that is not in the manifest",
    );
    assert.equal(readFileSync(lockPath, "utf8"), "{\"name\":\"npm-regenerated\"}\n");
  }

  // 7) Patch between stop and spawn: spawnDevServer must return the adopted
  //    session so runBoot's waitForReady stamps ready for that revision.
  //    boot_in_flight skips the patch probe — without this return,
  //    preview_success stays pending.
  {
    const { EventEmitter } = await import("node:events");
    const { createServer: createHttpServer } = await import("node:http");
    const { once } = await import("node:events");
    const bootSnapshot = seedSession({
      "package.json": JSON.stringify({ name: "boot-patch", private: true }),
      "app/page.tsx": PAGE_V1,
    });
    runtime.__testing.setBootInstallRunnersForTesting({
      installRunner: async () => ({
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "test install",
        usedFallback: false,
        peerConflictDetected: false,
      }),
    });

    let readyServer = null;
    runtime.__testing.setAfterRuntimeStopBeforeSpawnForTesting(() => {
      const patched = store.readStoreSync();
      patched.sessions[sessionId].mutationRevision = 2;
      patched.sessions[sessionId].lastAction = "patch";
      patched.sessions[sessionId].filesJson = {
        ...patched.sessions[sessionId].filesJson,
        "app/page.tsx": PAGE_V2,
      };
      store.writeStoreAtomicSync(patched);
    });
    runtime.__testing.setSpawnDevServerChildForTesting(async ({ runtimePort }) => {
      readyServer = createHttpServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html><body><main>adopted same-version preview is ready for clients now</main></body></html>",
        );
      });
      readyServer.listen(runtimePort, "127.0.0.1");
      await once(readyServer, "listening");
      const child = runtime.__testing.createFakeRuntimeChildForTesting();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    });

    try {
      await runtime.__testing.bootRuntimeForSession(bootSnapshot);
      let readySession = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        readySession = store.readStoreSync().sessions[sessionId];
        if (readySession?.readinessState === "ready") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        readySession?.readinessState,
        "ready",
        "boot must stamp ready for the session adopted between stop and spawn",
      );
      assert.equal(readySession?.mutationRevision, 2);
      assert.equal(readySession?.readinessError, null);
      assert.equal(readySession?.versionId, versionId);

      const tracked = runtime.__testing.getTrackedRuntimeReceiptForTesting(sessionId);
      assert.equal(
        tracked?.mutationRevision,
        2,
        "tracked receipt must match the adopted patch revision",
      );
      assert.equal(tracked?.versionId, versionId);

      const { createServer } = require("../src/server/create-server.js");
      const host = createServer();
      host.listen(0, "127.0.0.1");
      await once(host, "listening");
      const address = host.address();
      assert.ok(address && typeof address !== "string");
      try {
        const status = await fetch(
          `http://127.0.0.1:${address.port}/preview/session/${encodeURIComponent(previewSessionId)}/status`,
        );
        const body = await status.json();
        assert.equal(status.status, 200, body.message ?? "status should succeed");
        assert.equal(body.readinessState, "ready");
        assert.equal(
          body.httpReady,
          true,
          "status/heartbeat receipt must be green (preview_success) for the adopted revision",
        );
        assert.equal(body.mutationRevision, 2);
        assert.equal(body.versionId, versionId);
        assert.equal(body.running, true);
      } finally {
        await new Promise((resolve) => {
          host.close(() => resolve());
          host.closeAllConnections?.();
        });
      }
    } finally {
      runtime.__testing.setAfterRuntimeStopBeforeSpawnForTesting(null);
      runtime.__testing.setSpawnDevServerChildForTesting(null);
      runtime.__testing.setBootInstallRunnersForTesting();
      runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
      if (readyServer) {
        await new Promise((resolve) => {
          readyServer.close(() => resolve());
          readyServer.closeAllConnections?.();
        });
      }
    }
  }

  console.log("[test-patch-during-boot] All guards green.");
} finally {
  runtime.__testing.setBootRunnerForTesting(null);
  runtime.__testing.setAfterRuntimeStopBeforeSpawnForTesting(null);
  runtime.__testing.setSpawnDevServerChildForTesting(null);
  runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
  rmSync(dataDir, { recursive: true, force: true });
}
