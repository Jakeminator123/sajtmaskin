/**
 * SM-044: #980's reloadPage signal does not hold HTTP. A spawned-but-not-ready
 * runtime must stay gated (`acceptingTraffic`) so an open iframe cannot fetch
 * new-build HTML/JS while the old document is still on screen.
 *
 *   node scripts/test-runtime-swap-reload.mjs
 */
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { once } from "node:events";

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-swap-reload-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";

const require = createRequire(import.meta.url);
const runtime = require("../src/runtime.js");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  OK    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const requestReload = runtime.__testing.requestPreviewClientReload;
check(
  "requestPreviewClientReload stays the #980 reload helper (no second encoder)",
  typeof requestReload === "function",
);

{
  const chatId = "swap-reload-chat";
  const writes = [];
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.writable = true;
  socket.write = (buf) => {
    writes.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
    return true;
  };
  runtime.__testing.registerPreviewSocket(chatId, socket);

  const result = requestReload(chatId);
  const payload = Buffer.concat(writes).toString("utf8");
  check("restart notify reaches the open preview socket", result.sent === 1);
  check(
    "reload frame asks Next's HMR client to reload the page",
    payload.includes("reloadPage"),
  );
  socket.emit("close");
}

{
  const lifecycleSrc = readFileSync(
    new URL("../src/runtime/process-lifecycle.js", import.meta.url),
    "utf8",
  );
  const proxySrc = readFileSync(
    new URL("../src/runtime/preview-proxy.js", import.meta.url),
    "utf8",
  );
  check(
    "ensureRuntimeForChat still signals reload via the landed #980 helper",
    /requestPreviewClientReload\(chatId\)/.test(lifecycleSrc),
  );
  check(
    "ready after restart exposes traffic only after the reload signal",
    /exposeRuntimeToClients\(session, \{ restart, runtimePort, bootId: spawnedBootId \}\)/.test(
      lifecycleSrc,
    ),
  );
  check(
    "readiness state writes ignore a stale waitForReady from a previous boot",
    /isLiveBoot\(session\.sessionId, spawnedBootId\)/.test(lifecycleSrc),
  );
  check(
    "HTTP proxy requires acceptingTraffic — persisted failed readiness is not a bypass",
    /state\.running && state\.runtimePort && state\.acceptingTraffic/.test(proxySrc) &&
      !/state\.acceptingTraffic \|\| state\.session\.readinessState === "failed"/.test(proxySrc),
  );
}

{
  const store = require("../src/store.js");
  const chatId = "swap-gate-chat";
  const sessionId = "swap-gate-session";
  const previewSessionId = "ps_swap_gate";
  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-gate",
        previewUrl: `http://localhost/${chatId}`,
        status: "starting",
        lastAction: "start",
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimePort: 4242,
        readinessState: "starting",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: 4242,
    running: true,
    booting: true,
    acceptingTraffic: false,
  });
  const state = runtime.getRuntimeStateForChat(chatId);
  check(
    "spawned runtime is not accepting traffic before readiness",
    state.acceptingTraffic === false,
  );
  check(
    "process liveness stays true while traffic is gated",
    state.running === true,
  );
  runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
}

{
  const store = require("../src/store.js");
  const chatId = "swap-stale-ready";
  const sessionId = "swap-stale-session";
  const previewSessionId = "ps_swap_stale";
  const session = {
    sessionId,
    previewSessionId,
    chatId,
    versionId: "v-stale",
    previewUrl: `http://localhost/${chatId}`,
    status: "starting",
    lastAction: "start",
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runtimePort: 4301,
    readinessState: "starting",
  };
  store.writeStoreAtomicSync({
    sessions: { [sessionId]: session },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: 4301,
    running: true,
    booting: true,
    acceptingTraffic: false,
    bootId: 7,
  });
  const stale = runtime.__testing.exposeRuntimeToClients(session, {
    restart: true,
    runtimePort: 9999,
  });
  check("stale readiness on an old port does not expose traffic", stale === false);
  check(
    "stale readiness leaves the live runtime gated",
    runtime.getRuntimeStateForChat(chatId).acceptingTraffic === false,
  );
  const staleBoot = runtime.__testing.exposeRuntimeToClients(session, {
    restart: true,
    runtimePort: 4301,
    bootId: 6,
  });
  check("stale waitForReady from a previous boot does not expose traffic", staleBoot === false);

  const writes = [];
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.writable = true;
  socket.write = (buf) => {
    writes.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
    return true;
  };
  runtime.__testing.registerPreviewSocket(chatId, socket);
  const exposed = runtime.__testing.exposeRuntimeToClients(session, {
    restart: true,
    runtimePort: 4301,
    bootId: 7,
  });
  check("matching readiness exposes traffic", exposed === true);
  check(
    "matching readiness flips acceptingTraffic",
    runtime.getRuntimeStateForChat(chatId).acceptingTraffic === true,
  );
  check(
    "matching restart readiness notifies the open iframe",
    writes.some((buf) => buf.toString("utf8").includes("reloadPage")),
  );
  socket.emit("close");
  runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
}

{
  const store = require("../src/store.js");
  const queuedBoots = [];
  const previousQueue = runtime.queueRuntimeBoot;
  runtime.queueRuntimeBoot = (id, options = {}) => queuedBoots.push({ id, options });

  const upstream = http.createServer((req, res) => {
    if ((req.url ?? "").includes("_next/static")) {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      res.end("export default function NewRuntimeChunk(){return 'NEW_RUNTIME_JS'}");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body>NEW_RUNTIME_HTML</body></html>");
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamAddress = upstream.address();

  const { createServer } = require("../src/server.js");
  const host = createServer();
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const hostAddress = host.address();
  const hostBase = `http://127.0.0.1:${hostAddress.port}`;
  const chatId = "swap-proxy-gate";
  const sessionId = `session-${chatId}`;
  const previewSessionId = `ps-${chatId}`;

  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-swap",
        previewUrl: `${hostBase}/${chatId}`,
        status: "starting",
        lastAction: "start",
        changeClass: "fresh",
        startOutcome: "resumed",
        filesJson: { "app/page.tsx": "NEW" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        runtimePort: upstreamAddress.port,
        readinessState: "starting",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.markPendingPreviewClientReload(chatId);
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: upstreamAddress.port,
    running: true,
    booting: true,
    acceptingTraffic: false,
  });

  try {
    const gated = await fetch(`${hostBase}/${chatId}/`);
    const gatedBody = await gated.text();
    const gatedJs = await fetch(`${hostBase}/${chatId}/_next/static/chunks/app/page.js`);
    const gatedJsBody = await gatedJs.text();
    check(
      "proxy does not serve the new runtime before it is ready",
      gated.status === 200 && /Startar/.test(gatedBody) && !/NEW_RUNTIME_HTML/.test(gatedBody),
    );
    check(
      "pending #980 reload does not open HTTP /_next/static from the new runtime",
      !/NEW_RUNTIME_JS/.test(gatedJsBody),
    );

    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      runtimePort: upstreamAddress.port,
      running: true,
      booting: false,
      acceptingTraffic: true,
    });
    const open = await fetch(`${hostBase}/${chatId}/`);
    const openBody = await open.text();
    check(
      "proxy serves the new runtime only after it accepts traffic",
      open.status === 200 && /NEW_RUNTIME_HTML/.test(openBody),
    );
  } finally {
    runtime.queueRuntimeBoot = previousQueue;
    runtime.__testing.clearPendingPreviewClientReload(chatId);
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
    host.close();
    host.closeAllConnections?.();
    upstream.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

{
  const lifecycleSrc = readFileSync(
    new URL("../src/runtime/process-lifecycle.js", import.meta.url),
    "utf8",
  );
  const failedReadinessLog = "Readiness failed (runtime process alive but page not ready)";
  const failedReadinessAt = lifecycleSrc.indexOf(failedReadinessLog);
  const failedReadinessWindow =
    failedReadinessAt >= 0
      ? lifecycleSrc.slice(Math.max(0, failedReadinessAt - 500), failedReadinessAt + failedReadinessLog.length)
      : "";
  check(
    "failed readiness on a live process opens the traffic gate (not just readinessState=failed)",
    /exposeRuntimeToClients\(session/.test(failedReadinessWindow),
  );
}

{
  const store = require("../src/store.js");
  const queuedBoots = [];
  const previousQueue = runtime.queueRuntimeBoot;
  runtime.queueRuntimeBoot = (id, options = {}) => queuedBoots.push({ id, options });

  const overlay = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body>BUILD_ERROR_OVERLAY</body></html>");
  });
  overlay.listen(0, "127.0.0.1");
  await once(overlay, "listening");
  const overlayAddress = overlay.address();

  const { createServer } = require("../src/server.js");
  const host = createServer();
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const hostAddress = host.address();
  const hostBase = `http://127.0.0.1:${hostAddress.port}`;
  const chatId = "swap-failed-readiness";
  const sessionId = `session-${chatId}`;
  const previewSessionId = `ps-${chatId}`;

  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-failed",
        previewUrl: `${hostBase}/${chatId}`,
        status: "warm_project",
        lastAction: "start",
        changeClass: "fresh",
        startOutcome: "resumed",
        filesJson: { "app/page.tsx": "BROKEN" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        runtimePort: overlayAddress.port,
        readinessState: "failed",
        readinessError: "readiness probe timed out",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: overlayAddress.port,
    running: true,
    booting: false,
    acceptingTraffic: false,
  });

  try {
    const staleFailed = await fetch(`${hostBase}/${chatId}/`);
    const staleFailedBody = await staleFailed.text();
    check(
      "persisted failed readiness does not open HTTP for a gated child",
      staleFailed.status === 200 &&
        /Startar/.test(staleFailedBody) &&
        !/BUILD_ERROR_OVERLAY/.test(staleFailedBody),
    );

    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      runtimePort: overlayAddress.port,
      running: true,
      booting: false,
      acceptingTraffic: true,
    });
    const response = await fetch(`${hostBase}/${chatId}/`);
    const body = await response.text();
    check(
      "live runtime with failed readiness does not stay on the starting page",
      !/Startar/.test(body),
    );
    check(
      "live runtime with failed readiness shows the overlay or the held error page",
      /BUILD_ERROR_OVERLAY/.test(body) || /Preview kunde inte starta/.test(body),
    );
  } finally {
    runtime.queueRuntimeBoot = previousQueue;
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
    host.close();
    host.closeAllConnections?.();
    overlay.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

{
  const lifecycleSrc = readFileSync(
    new URL("../src/runtime/process-lifecycle.js", import.meta.url),
    "utf8",
  );
  const startingWrite = lifecycleSrc.match(
    /stored\.status = "starting";[\s\S]{0,1600}?stored\.updatedAt = nowIso\(\);\s*\}\);/,
  );
  check(
    "boot start resets non-prewarm readiness in the same write as status=starting",
    Boolean(
      startingWrite &&
        /session\.prewarm !== true/.test(startingWrite[0]) &&
        /readinessState = "starting"/.test(startingWrite[0]),
    ),
  );
  check(
    "boot start does not write readinessState for prewarm sessions",
    Boolean(startingWrite && /if \(session\.prewarm !== true\)/.test(startingWrite[0])),
  );
}

{
  const store = require("../src/store.js");
  const queuedBoots = [];
  const previousQueue = runtime.queueRuntimeBoot;
  runtime.queueRuntimeBoot = (id, options = {}) => queuedBoots.push({ id, options });

  let releaseInstall;
  const installHung = new Promise((resolve, reject) => {
    releaseInstall = { resolve, reject };
  });
  runtime.__testing.setBootInstallRunnersForTesting({
    installRunner: () =>
      installHung.then(() => ({
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "test hang",
        usedFallback: false,
        peerConflictDetected: false,
      })),
  });

  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body>STALE_FAILED_NEW_CHILD_HTML</body></html>");
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamAddress = upstream.address();

  const { createServer } = require("../src/server.js");
  const host = createServer();
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const hostAddress = host.address();
  const hostBase = `http://127.0.0.1:${hostAddress.port}`;
  const chatId = "swap-stale-failed-gap";
  const sessionId = `session-${chatId}`;
  const previewSessionId = `ps-${chatId}`;
  const versionId = "v-stale-failed";
  const priorCleanExits = [1_000_000, 1_000_500];

  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId,
        previewUrl: `${hostBase}/${chatId}`,
        status: "warm_project",
        lastAction: "start",
        changeClass: "fresh",
        startOutcome: "resumed",
        filesJson: {
          "app/page.tsx": "export default function Page(){return null}",
          "package.json": JSON.stringify({ name: "stale-failed-gap", private: true }),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        runtimePort: upstreamAddress.port,
        readinessState: "failed",
        readinessError: "previous boot overlay",
        runtimeCleanExitVersionId: versionId,
        runtimeCleanExitTimestamps: priorCleanExits,
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });

  const bootPromise = runtime.__testing.bootRuntimeForSession(
    store.readStoreSync().sessions[sessionId],
    { restart: false },
  );

  try {
    let started = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      started = store.readStoreSync().sessions[sessionId];
      if (started?.status === "starting") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    check(
      "stale-failed boot reaches status=starting while install is still in flight",
      started?.status === "starting",
    );
    check(
      "stale failed readiness is cleared before a new child can be registered",
      started?.readinessState === "starting" && started?.readinessError == null,
    );
    check(
      "clean-exit budget is preserved when the previous status was not starting",
      Array.isArray(started?.runtimeCleanExitTimestamps) &&
        started.runtimeCleanExitTimestamps.length === 2 &&
        started.runtimeCleanExitVersionId === versionId,
    );

    runtime.__testing.setRuntimeStateForTesting({
      chatId,
      sessionId,
      previewSessionId,
      runtimePort: upstreamAddress.port,
      running: true,
      booting: true,
      acceptingTraffic: false,
    });
    const response = await fetch(`${hostBase}/${chatId}/`);
    const body = await response.text();
    check(
      "stale failed readiness must not open the gate for a newly spawned gated runtime",
      response.status === 200 &&
        /Startar/.test(body) &&
        !/STALE_FAILED_NEW_CHILD_HTML/.test(body),
    );
  } finally {
    releaseInstall.reject(new Error("stale-failed-gap test abort"));
    runtime.__testing.setBootInstallRunnersForTesting();
    runtime.queueRuntimeBoot = previousQueue;
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
    await bootPromise.catch(() => undefined);
    host.close();
    host.closeAllConnections?.();
    upstream.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

{
  const store = require("../src/store.js");
  const chatId = "swap-idle-gated";
  const sessionId = "swap-idle-gated-session";
  const previewSessionId = "ps-swap-idle-gated";
  const staleActivityAt = Date.now() - 11 * 60 * 1000;
  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-idle-gated",
        previewUrl: `http://localhost/${chatId}`,
        status: "warm_project",
        lastAction: "start",
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimePort: 40123,
        readinessState: "starting",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: 40123,
    running: true,
    booting: false,
    acceptingTraffic: false,
    lastActivityAt: staleActivityAt,
  });
  const swept = await runtime.sweepIdleRuntimes(Date.now());
  const afterSweep = runtime.getRuntimeStateForChat(chatId);
  check(
    "idle reaper does not stop a live runtime that is still waiting for readiness",
    swept.stoppedRuntimes === 0 && afterSweep.running === true,
  );
  runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
}

{
  const store = require("../src/store.js");
  const queuedBoots = [];
  const previousQueue = runtime.queueRuntimeBoot;
  runtime.queueRuntimeBoot = (id, options = {}) => queuedBoots.push({ id, options });

  const { createServer } = require("../src/server.js");
  const host = createServer();
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const hostAddress = host.address();
  const hostBase = `http://127.0.0.1:${hostAddress.port}`;
  const chatId = "swap-starting-activity";
  const sessionId = `session-${chatId}`;
  const previewSessionId = `ps-${chatId}`;
  const staleActivityAt = Date.now() - 11 * 60 * 1000;

  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-activity",
        previewUrl: `${hostBase}/${chatId}`,
        status: "warm_project",
        lastAction: "start",
        changeClass: "fresh",
        startOutcome: "resumed",
        filesJson: { "app/page.tsx": "WAIT" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        runtimePort: 40124,
        readinessState: "starting",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: 40124,
    running: true,
    booting: false,
    acceptingTraffic: false,
    lastActivityAt: staleActivityAt,
  });

  try {
    await fetch(`${hostBase}/${chatId}/`);
    const after = runtime.getRuntimeStateForChat(chatId);
    check(
      "starting-page traffic counts as activity while the runtime is gated",
      typeof after.lastActivityAt === "number" && after.lastActivityAt > staleActivityAt,
    );
  } finally {
    runtime.queueRuntimeBoot = previousQueue;
    runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
    host.close();
    host.closeAllConnections?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

{
  // Windows hides a broken fake child: sweep uses taskkill and never calls
  // child.kill(). Linux does, then waits for `close`. This is the contract
  // the ready-idle negative control depends on.
  const child = runtime.__testing.createFakeRuntimeChildForTesting();
  let posixThrew = null;
  try {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } catch (err) {
    posixThrew = err;
  }
  const closed = await Promise.race([
    new Promise((resolve) => child.once("close", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 200)),
  ]);
  check(
    "fake runtime child is stoppable on the POSIX reaper path",
    posixThrew == null && closed === true && child.exitCode !== null,
  );
}

{
  const store = require("../src/store.js");
  const chatId = "swap-idle-ready";
  const sessionId = "swap-idle-ready-session";
  const previewSessionId = "ps-swap-idle-ready";
  store.writeStoreAtomicSync({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId: "v-idle-ready",
        previewUrl: `http://localhost/${chatId}`,
        status: "warm_project",
        lastAction: "start",
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimePort: 40125,
        readinessState: "ready",
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
    prewarmLeases: {},
  });
  runtime.__testing.setRuntimeStateForTesting({
    chatId,
    sessionId,
    previewSessionId,
    runtimePort: 40125,
    running: true,
    booting: false,
    acceptingTraffic: true,
    lastActivityAt: Date.now() - 11 * 60 * 1000,
  });
  const swept = await runtime.sweepIdleRuntimes(Date.now());
  check(
    "idle reaper still stops a ready runtime with no traffic",
    swept.stoppedRuntimes === 1,
  );
  runtime.__testing.clearRuntimeStateForTesting(chatId, sessionId);
}

rmSync(dataDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`[test-runtime-swap-reload] FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("[test-runtime-swap-reload] All swap-reload guards green.");
