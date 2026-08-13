/**
 * SM-044: a runtime restart must not leave an open iframe with HTML from
 * one build and JS from another.
 *
 *   1. After a restart the host must tell connected preview clients to reload
 *      (Next HMR stub / held preview socket — the existing iframe channel).
 *   2. A spawned-but-not-ready runtime must not accept proxy traffic, so the
 *      client cannot fetch app HTML from the old document and app JS from the
 *      new process in the same paint.
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

const notify = runtime.__testing.notifyPreviewClientsToReload;
check(
  "notifyPreviewClientsToReload is exported for the restart handoff",
  typeof notify === "function",
);

{
  const chatId = "swap-reload-chat";
  const writes = [];
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.write = (buf) => {
    writes.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
    return true;
  };
  runtime.__testing.registerPreviewSocket(chatId, socket);

  let sent = 0;
  if (typeof notify === "function") {
    sent = notify(chatId);
  }
  const payload = Buffer.concat(writes).toString("utf8");
  check("restart notify reaches the open preview socket", sent === 1);
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
  check(
    "restart stop notifies open preview clients before the new process is spawned",
    /await stopRuntimeForSession\(session\);[\s\S]{0,400}notifyPreviewClientsToReload\(getSessionChatId\(session\)\)/.test(
      lifecycleSrc,
    ),
  );
  check(
    "ready after restart exposes traffic only after the reload signal",
    /exposeRuntimeToClients\(session, \{ restart, runtimePort \}\)/.test(lifecycleSrc),
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

  const writes = [];
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.write = (buf) => {
    writes.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
    return true;
  };
  runtime.__testing.registerPreviewSocket(chatId, socket);
  const exposed = runtime.__testing.exposeRuntimeToClients(session, {
    restart: true,
    runtimePort: 4301,
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

  const upstream = http.createServer((_req, res) => {
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
    check(
      "proxy does not serve the new runtime before it is ready",
      gated.status === 200 && /Startar/.test(gatedBody) && !/NEW_RUNTIME_HTML/.test(gatedBody),
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
