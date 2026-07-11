import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// CI/package guard: this real HTTP/WS contract is invoked by `test:guards`;
// do not replace it with state-only assertions.
const require = createRequire(import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), "preview-host-proxy-contract-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
process.env.SAJTMASKIN_PREVIEW_HMR_PROXY = "true";

let upstreamUpgradeHits = 0;
const upstream = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><html><body>SKELETON_OR_LAST_GOOD_HTML</body></html>");
});
upstream.on("upgrade", (_req, socket) => {
  upstreamUpgradeHits += 1;
  socket.destroy();
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
const upstreamAddress = upstream.address();
assert.ok(upstreamAddress && typeof upstreamAddress !== "string");

const store = require("../src/store.js");
const runtime = require("../src/runtime.js");
const queuedBoots = [];
runtime.queueRuntimeBoot = (chatId, options = {}) => queuedBoots.push({ chatId, options });
const { createServer } = require("../src/server.js");
const host = createServer();
host.listen(0, "127.0.0.1");
await once(host, "listening");
const hostAddress = host.address();
assert.ok(hostAddress && typeof hostAddress !== "string");
const hostBase = `http://127.0.0.1:${hostAddress.port}`;

function writeSession(overrides) {
  const chatId = overrides.chatId;
  const sessionId = `session-${chatId}`;
  const previewSessionId = `ps-${chatId}`;
  const session = {
    sessionId,
    previewSessionId,
    chatId,
    versionId: overrides.versionId ?? "version-1",
    previewUrl: `${hostBase}/${chatId}`,
    status: overrides.status ?? "warm_project",
    lastAction: "start",
    changeClass: "fresh",
    startOutcome: "fresh",
    filesJson: { "app/page.tsx": "SKELETON" },
    prewarm: overrides.prewarm === true,
    prewarmReplacementPending: overrides.prewarmReplacementPending === true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    runtimePort: upstreamAddress.port,
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
    runtimePort: upstreamAddress.port,
    running: true,
    booting: overrides.booting === true,
  });
  return session;
}

async function html(pathname) {
  const response = await fetch(`${hostBase}${pathname}`);
  return { status: response.status, body: await response.text() };
}

async function json(pathname) {
  const response = await fetch(`${hostBase}${pathname}`);
  return { status: response.status, body: await response.json() };
}

async function websocketHandshake(pathname) {
  const socket = net.createConnection({ host: "127.0.0.1", port: hostAddress.port });
  await once(socket, "connect");
  socket.write(
    [
      `GET ${pathname} HTTP/1.1`,
      `Host: 127.0.0.1:${hostAddress.port}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "",
      "",
    ].join("\r\n"),
  );
  const [chunk] = await once(socket, "data");
  socket.destroy();
  return String(chunk);
}

try {
  const prewarm = writeSession({ chatId: "prewarm-running", prewarm: true });
  const prewarmHtml = await html(`/${prewarm.chatId}`);
  assert.equal(prewarmHtml.status, 200);
  assert.match(prewarmHtml.body, /Startar preview/);
  assert.doesNotMatch(prewarmHtml.body, /SKELETON_OR_LAST_GOOD_HTML/);
  const prewarmWs = await websocketHandshake(`/${prewarm.chatId}/app-socket`);
  assert.match(prewarmWs, /^HTTP\/1\.1 503 Service Unavailable/m);
  assert.equal(upstreamUpgradeHits, 0);

  runtime.__testing.clearRuntimeStateForTesting(prewarm.chatId, prewarm.sessionId);
  const failedPrewarm = writeSession({
    chatId: "prewarm-failed",
    prewarm: true,
    status: "error",
  });
  const queuedBeforeFailedPrewarm = queuedBoots.length;
  const failedPrewarmHtml = await html(`/${failedPrewarm.chatId}`);
  assert.equal(failedPrewarmHtml.status, 503);
  assert.match(failedPrewarmHtml.body, /Preview kunde inte starta/);
  assert.doesNotMatch(failedPrewarmHtml.body, /http-equiv="refresh"/i);
  assert.doesNotMatch(failedPrewarmHtml.body, /SKELETON_OR_LAST_GOOD_HTML/);
  const failedPrewarmStatus = await json(
    `/preview/session/${failedPrewarm.previewSessionId}/status`,
  );
  assert.equal(failedPrewarmStatus.body.status, "error");
  assert.equal(failedPrewarmStatus.body.running, false);
  assert.equal(queuedBoots.length, queuedBeforeFailedPrewarm);
  const failedPrewarmWs = await websocketHandshake(
    `/${failedPrewarm.chatId}/any-websocket`,
  );
  assert.match(failedPrewarmWs, /^HTTP\/1\.1 503 Service Unavailable/m);
  assert.equal(queuedBoots.length, queuedBeforeFailedPrewarm);
  assert.equal(upstreamUpgradeHits, 0);

  runtime.__testing.clearRuntimeStateForTesting(
    failedPrewarm.chatId,
    failedPrewarm.sessionId,
  );
  const replacement = writeSession({
    chatId: "replacement-running",
    prewarmReplacementPending: true,
    booting: true,
  });
  const replacementHtml = await html(`/${replacement.chatId}`);
  assert.match(replacementHtml.body, /Startar preview/);
  assert.doesNotMatch(replacementHtml.body, /SKELETON_OR_LAST_GOOD_HTML/);
  const replacementStatus = await json(
    `/preview/session/${replacement.previewSessionId}/status`,
  );
  assert.equal(replacementStatus.body.running, false);

  // Every WebSocket upgrade—not only HMR—is refused while replacement is
  // pending and never reaches the skeleton runtime.
  const ws = await websocketHandshake(
    `/${replacement.chatId}/custom-websocket`,
  );
  assert.match(ws, /^HTTP\/1\.1 503 Service Unavailable/m);
  assert.equal(upstreamUpgradeHits, 0);

  runtime.__testing.clearRuntimeStateForTesting(replacement.chatId, replacement.sessionId);
  const failed = writeSession({
    chatId: "replacement-failed",
    prewarmReplacementPending: true,
    status: "error",
  });
  const queuedBeforeFailedTraffic = queuedBoots.length;
  const failedHtml = await html(`/${failed.chatId}`);
  assert.equal(failedHtml.status, 503);
  assert.match(failedHtml.body, /Preview kunde inte starta/);
  assert.doesNotMatch(failedHtml.body, /http-equiv="refresh"/i);
  assert.doesNotMatch(failedHtml.body, /SKELETON_OR_LAST_GOOD_HTML/);
  assert.equal(runtime.getRuntimeStateForChat(failed.chatId).booting, false);
  const failedStatus = await json(
    `/preview/session/${failed.previewSessionId}/status`,
  );
  assert.equal(failedStatus.body.status, "error");
  assert.equal(failedStatus.body.running, false);
  assert.equal(queuedBoots.length, queuedBeforeFailedTraffic);
  const failedWs = await websocketHandshake(`/${failed.chatId}/any-websocket`);
  assert.match(failedWs, /^HTTP\/1\.1 503 Service Unavailable/m);
  assert.equal(upstreamUpgradeHits, 0);

  runtime.__testing.clearRuntimeStateForTesting(failed.chatId, failed.sessionId);
  const ordinary = writeSession({
    chatId: "ordinary-last-good",
    booting: true,
  });
  const ordinaryHtml = await html(`/${ordinary.chatId}`);
  assert.match(ordinaryHtml.body, /SKELETON_OR_LAST_GOOD_HTML/);
  assert.doesNotMatch(ordinaryHtml.body, /Startar preview/);
  const ordinaryStatus = await json(
    `/preview/session/${ordinary.previewSessionId}/status`,
  );
  assert.equal(ordinaryStatus.body.running, true);

  console.log("[test-preview-proxy-contract] All proxy contracts green.");
} finally {
  for (const chatId of [
    "prewarm-running",
    "prewarm-failed",
    "replacement-running",
    "replacement-failed",
    "ordinary-last-good",
  ]) {
    runtime.__testing.clearRuntimeStateForTesting(chatId, `session-${chatId}`);
  }
  host.close();
  host.closeAllConnections?.();
  host.closeIdleConnections?.();
  upstream.close();
  upstream.closeAllConnections?.();
  upstream.closeIdleConnections?.();
  await new Promise((resolve) => setTimeout(resolve, 50));
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.SAJTMASKIN_PREVIEW_HMR_PROXY;
}
