import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";

// CI/package guard: this real HTTP/WS contract is invoked by `test:guards`;
// do not replace it with state-only assertions.
const require = createRequire(import.meta.url);

// Lock the installed Next dev contract which makes the host's viewer identity
// reach HMR. `x-nextjs-request-id` becomes app-render's requestId, requestId is
// injected as self.__next_r, and the HMR client sends that value as `?id=`.
// `x-nextjs-html-request-id` is a separate debug/document association and is
// deliberately not sufficient on its own.
function assertInstalledNextViewerContract() {
  try {
    require.resolve("next/package.json");
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      // `preview-host-guards` intentionally installs only this standalone
      // package. Keep the real proxy contract mandatory there, while the
      // source-level Next compatibility lock runs whenever the root app's
      // installed Next package is available.
      console.log("  SKIP  installed Next source contract (standalone preview-host)");
      return;
    }
    throw error;
  }

  const nextAppRouterHeaders = require(
    "next/dist/client/components/app-router-headers.js",
  );
  assert.equal(nextAppRouterHeaders.NEXT_REQUEST_ID_HEADER, "x-nextjs-request-id");
  assert.equal(nextAppRouterHeaders.NEXT_HTML_REQUEST_ID_HEADER, "x-nextjs-html-request-id");
  const nextAppRenderSource = readFileSync(
    require.resolve("next/dist/server/app-render/app-render.js"),
    "utf8",
  );
  assert.match(
    nextAppRenderSource,
    /requestId\s*=\s*parsedRequestHeaders\.requestId/,
    "Next app-render must source requestId from x-nextjs-request-id",
  );
  assert.match(
    nextAppRenderSource,
    /self\.__next_r=\$\{JSON\.stringify\(requestId\s*\?\?\s*crypto\.randomUUID\(\)\)\}/,
    "Next app-render must inject requestId as self.__next_r",
  );
  const nextHmrClientSource = readFileSync(
    require.resolve("next/dist/client/dev/hot-reloader/app/web-socket.js"),
    "utf8",
  );
  assert.match(
    nextHmrClientSource,
    /_next\/webpack-hmr\?id=\$\{self\.__next_r\}/,
    "Next HMR must reconnect with self.__next_r as its id query",
  );
  assert.match(
    nextHmrClientSource,
    /const requestId = textDecoder\.decode\(/,
    "Next's debug channel must decode the exact request id carried in each HMR chunk",
  );
  const nextHotReloaderSource = readFileSync(
    require.resolve("next/dist/client/dev/hot-reloader/app/hot-reloader-app.js"),
    "utf8",
  );
  assert.match(
    nextHotReloaderSource,
    /getOrCreateDebugChannelReadableWriterPair\)\(requestId\)/,
    "Next's React debug channel must key hydration data by the exact decoded request id",
  );
}

assertInstalledNextViewerContract();

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-proxy-contract-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
process.env.SAJTMASKIN_PREVIEW_HMR_PROXY = "true";
process.env.SAJTMASKIN_APP_ORIGIN = "https://app.example";

let upstreamUpgradeHits = 0;
let lastUpstreamHeaders = null;
let lastUpstreamUrl = null;
let lastUpstreamMethod = null;
let lastUpstreamBody = null;
let lastUpstreamUpgradeUrl = null;
let lastUpstreamUpgradeHeaders = null;
let releaseDelayedTail = null;
let delayedTailStarted = null;
let releaseDelayedHeaders = null;
let delayedHeaderRequestStarted = null;
let rejectNextUpgrade = false;
const upstreamUpgradeSockets = new Set();
const upstreamCsp = "default-src 'self'; script-src 'nonce-preview-test' 'strict-dynamic'";
const normalUpstreamHtml =
  '<!doctype html><html><head><script nonce="preview-test">self.__mock_next_boot=window.location.search</script></head><body>SKELETON_OR_LAST_GOOD_HTML</body></html>';
const largeDocumentStart = Buffer.from(
  '<!doctype html><html><head><script nonce="preview-test">self.__mock_next_boot=window.location.search</script></head><body>',
  "utf8",
);
const largePrefix = Buffer.concat([
  largeDocumentStart,
  Buffer.alloc(5 * 1024 * 1024 - largeDocumentStart.length, 0x61),
]);
const splitEmoji = Buffer.from("🧪", "utf8");
const largeDocumentTail = Buffer.from("TAIL</body></html>", "utf8");
const upstream = http.createServer((req, res) => {
  lastUpstreamHeaders = req.headers;
  lastUpstreamUrl = req.url;
  lastUpstreamMethod = req.method;
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    lastUpstreamBody = Buffer.concat(chunks).toString("utf8");
    const requestPath = new URL(req.url, "http://runtime.invalid").pathname;
    if (requestPath.endsWith("/no-content")) {
      res.writeHead(204, { "content-type": "text/html; charset=utf-8" });
      res.end();
      return;
    }
    if (requestPath.endsWith("/server-fail")) {
      res.writeHead(500, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": upstreamCsp,
      });
      res.end(normalUpstreamHtml);
      return;
    }
    if (requestPath.endsWith("/csp-precedence")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'self'; script-src 'nonce-wrong'; script-src-elem 'nonce-right' 'strict-dynamic'",
        "content-security-policy-report-only": "script-src 'nonce-report-only'",
      });
      res.end(
        '<!doctype html><html><head><script nonce="right">self.__mock_next_boot=window.location.search</script></head><body>CSP</body></html>',
      );
      return;
    }
    if (requestPath.endsWith("/csp-duplicate-script-src")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "script-src 'nonce-real'; script-src 'nonce-other'",
      });
      res.end(
        '<!doctype html><html><head><script nonce="real">self.__mock_next_boot=window.location.search</script></head><body>CSP</body></html>',
      );
      return;
    }
    if (requestPath.endsWith("/csp-report-only")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; script-src 'self'",
        "content-security-policy-report-only": "script-src 'nonce-report-only'",
      });
      res.end(normalUpstreamHtml);
      return;
    }
    if (requestPath.endsWith("/redirect-local")) {
      const chatPrefix = requestPath.split("/").filter(Boolean)[0];
      res.writeHead(302, { location: `/${chatPrefix}/redirect-target?app=1` });
      res.end();
      return;
    }
    if (requestPath.endsWith("/redirect-external")) {
      res.writeHead(302, { location: "https://example.com/elsewhere?app=1" });
      res.end();
      return;
    }
    if (requestPath.endsWith("/redirect-other-chat")) {
      res.writeHead(302, { location: "/another-chat/target?app=1" });
      res.end();
      return;
    }
    if (requestPath.endsWith("/redirect-parent")) {
      res.writeHead(302, { location: "../escaped?app=1" });
      res.end();
      return;
    }
    if (requestPath.endsWith("/redirect-backslash")) {
      res.writeHead(302, { location: "\\\\evil.example/path?app=1" });
      res.end();
      return;
    }
    if (requestPath.endsWith("/large-stream")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": upstreamCsp,
      });
      res.write(largePrefix);
      res.write(splitEmoji.subarray(0, 2));
      setImmediate(() => res.end(Buffer.concat([splitEmoji.subarray(2), largeDocumentTail])));
      return;
    }
    if (requestPath.endsWith("/large-error")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": upstreamCsp,
      });
      res.write(largePrefix);
      res.write(Buffer.from("X", "utf8"));
      setImmediate(() => res.destroy(new Error("intentional large stream abort")));
      return;
    }
    if (requestPath.endsWith("/delayed-tail")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": upstreamCsp,
      });
      res.write(
        '<!doctype html><html><head><script nonce="preview-test">self.__mock_next_boot=window.location.search</script></head><body>SHELL_VISIBLE',
      );
      delayedTailStarted?.();
      releaseDelayedTail = () => {
        releaseDelayedTail = null;
        res.end("DELAYED_TAIL</body></html>");
      };
      return;
    }
    if (requestPath.endsWith("/delayed-headers")) {
      delayedHeaderRequestStarted?.();
      releaseDelayedHeaders = () => {
        releaseDelayedHeaders = null;
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": upstreamCsp,
        });
        res.end(normalUpstreamHtml);
      };
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": upstreamCsp,
    });
    res.end(normalUpstreamHtml);
  });
});
upstream.on("upgrade", (req, socket) => {
  upstreamUpgradeHits += 1;
  upstreamUpgradeSockets.add(socket);
  socket.once("close", () => upstreamUpgradeSockets.delete(socket));
  lastUpstreamUpgradeUrl = req.url;
  lastUpstreamUpgradeHeaders = req.headers;
  if (rejectNextUpgrade) {
    rejectNextUpgrade = false;
    socket.end(
      "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.on("data", () => {});
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
const viewerA = "smv_11111111-1111-4111-8111-111111111111";
const viewerDocument = "smv_22222222-2222-4222-8222-222222222222";

assert.equal(
  runtime.__testing.previewViewerIdFromRequest(
    { headers: { referer: `${hostBase}/chat-a?__sm_viewer=${viewerA}` } },
    "",
  ),
  viewerA,
);
assert.equal(
  runtime.__testing.previewViewerIdFromRequest(
    { headers: { referer: `${hostBase}/chat-a?__sm_viewer=${viewerA}` } },
    "?__sm_viewer=viewer-request",
  ),
  "viewer-request",
  "request query takes precedence over the document Referer",
);
assert.equal(
  runtime.__testing.previewHmrIdentityFromSearch(
    `?id=smd_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&__sm_viewer=${viewerA}`,
  )?.viewerId,
  viewerA,
  "Next HMR carries stable viewer identity separately from its exact document id",
);
assert.equal(
  runtime.__testing.previewViewerIdFromRequest(
    { headers: { referer: `${hostBase}/chat-a?__sm_viewer=${"x".repeat(129)}` } },
    "",
  ),
  null,
  "viewer ids are length-bounded",
);
assert.equal(
  runtime.__testing.previewViewerIdFromRequest(
    { headers: { referer: `${hostBase}/chat-a?__sm_viewer=bad%20viewer` } },
    "",
  ),
  null,
  "viewer ids reject unsafe characters",
);

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

// Raw request so we can set browser-managed Origin/Referer headers and verify
// that proxying preserves method, query and body.
function rawRequest(pathname, { method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: hostAddress.port, path: pathname, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyBuffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: bodyBuffer.toString("utf8"),
            bodyBuffer,
            aborted: false,
            complete: res.complete,
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function rawRequestAllowAbort(pathname, { method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request(
      { host: "127.0.0.1", port: hostAddress.port, path: pathname, method, headers },
      (res) => {
        const chunks = [];
        const finish = (aborted) => {
          if (settled) return;
          settled = true;
          const bodyBuffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: bodyBuffer.toString("utf8"),
            bodyBuffer,
            aborted,
            complete: res.complete,
          });
        };
        res.on("data", (chunk) => chunks.push(chunk));
        res.once("end", () => finish(false));
        res.once("aborted", () => finish(true));
        res.once("error", () => finish(true));
        res.once("close", () => {
          if (!res.complete) finish(true);
        });
      },
    );
    req.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    if (body) req.write(body);
    req.end();
  });
}

function rawGet(pathname, headers = {}) {
  return rawRequest(pathname, { headers });
}

function openStreamingGet(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: hostAddress.port, path: pathname, headers },
      (res) => {
        const chunks = [];
        const textWaiters = new Set();
        let settled = false;
        const bodyText = () => Buffer.concat(chunks).toString("utf8");
        const flushWaiters = () => {
          const text = bodyText();
          for (const waiter of [...textWaiters]) {
            if (!text.includes(waiter.pattern)) continue;
            textWaiters.delete(waiter);
            waiter.resolve(text);
          }
        };
        res.on("data", (chunk) => {
          chunks.push(chunk);
          flushWaiters();
        });
        const done = new Promise((doneResolve) => {
          const finish = (aborted) => {
            if (settled) return;
            settled = true;
            for (const waiter of textWaiters) {
              waiter.reject(new Error(`stream ended before ${waiter.pattern}`));
            }
            textWaiters.clear();
            doneResolve({
              aborted,
              complete: res.complete,
              body: bodyText(),
              bodyBuffer: Buffer.concat(chunks),
            });
          };
          res.once("end", () => finish(false));
          res.once("aborted", () => finish(true));
          res.once("error", () => finish(true));
          res.once("close", () => {
            if (!res.complete) finish(true);
          });
        });
        resolve({
          req,
          res,
          chunks,
          bodyText,
          done,
          waitForText(pattern) {
            if (bodyText().includes(pattern)) return Promise.resolve(bodyText());
            return new Promise((waitResolve, waitReject) => {
              textWaiters.add({ pattern, resolve: waitResolve, reject: waitReject });
            });
          },
          abort() {
            res.destroy();
            req.destroy();
          },
        });
      },
    );
    req.once("error", reject);
    req.end();
  });
}

function extractBootstrapTag(body) {
  const match = body.match(
    /<script data-sajtmaskin-preview-bootstrap data-document-id="([^"]+)" data-storage-key="([^"]+)" data-chat-path="([^"]+)" src="([^"]+)"(?: nonce="([^"]+)")?><\/script>/,
  );
  assert.ok(match, "successful document HTML contains the host bootstrap tag");
  return {
    markup: match[0],
    documentId: match[1],
    storageKey: match[2],
    chatPath: match[3],
    bootstrapSrc: match[4],
    nonce: match[5] ?? "",
    index: match.index,
  };
}

async function executePreviewBootstrap({
  page,
  browserUrl,
  sessionStorage,
  mintedUuid,
}) {
  const tag = extractBootstrapTag(page.body);
  const bootstrapResponse = await rawGet(tag.bootstrapSrc);
  assert.equal(bootstrapResponse.status, 200);
  assert.match(
    String(bootstrapResponse.headers["content-type"]),
    /^application\/javascript/,
  );

  let currentUrl = new URL(browserUrl);
  let replacedUrl = null;
  const openedSockets = [];
  class NativeWebSocket {
    constructor(url, protocols) {
      this.url = String(url);
      this.protocolsArgument = protocols;
      openedSockets.push(this);
    }
  }
  Object.defineProperties(NativeWebSocket, {
    CONNECTING: { value: 0 },
    OPEN: { value: 1 },
    CLOSING: { value: 2 },
    CLOSED: { value: 3 },
  });
  const currentScript = {
    nonce: tag.nonce,
    getAttribute(name) {
      return {
        "data-document-id": tag.documentId,
        "data-storage-key": tag.storageKey,
        "data-chat-path": tag.chatPath,
        nonce: tag.nonce,
      }[name] ?? null;
    },
    remove() {},
  };
  const location = {
    get href() {
      return currentUrl.href;
    },
    get origin() {
      return currentUrl.origin;
    },
    get protocol() {
      return currentUrl.protocol;
    },
    get host() {
      return currentUrl.host;
    },
    get search() {
      return currentUrl.search;
    },
  };
  const browserWindow = {
    location,
    history: {
      state: { preserved: true },
      replaceState(_state, _title, nextUrl) {
        replacedUrl = nextUrl;
        currentUrl = new URL(nextUrl, currentUrl);
      },
    },
    sessionStorage: {
      getItem(key) {
        return sessionStorage.get(key) ?? null;
      },
      setItem(key, value) {
        sessionStorage.set(key, String(value));
      },
    },
    crypto: { randomUUID: () => mintedUuid },
    WebSocket: NativeWebSocket,
  };
  const document = {
    currentScript,
  };
  const context = {
    URL,
    Math,
    Proxy,
    Reflect,
    window: browserWindow,
    self: browserWindow,
    document,
  };
  runInNewContext(bootstrapResponse.body, context);
  assert.equal(
    browserWindow.__next_r,
    undefined,
    "host bootstrap must leave Next's request/debug identity untouched",
  );
  browserWindow.__next_r = tag.documentId;
  assert.equal(
    browserWindow.__next_r,
    tag.documentId,
    "Next assigns the exact seeded document id to self.__next_r",
  );
  const hmrProtocols = ["next-hmr"];
  const hmrSocket = new browserWindow.WebSocket(
    `${currentUrl.protocol === "https:" ? "wss:" : "ws:"}//${currentUrl.host}${tag.chatPath}/_next/webpack-hmr?id=${encodeURIComponent(tag.documentId)}&transport=ws&__sm_viewer=spoofed`,
    hmrProtocols,
  );
  assert.ok(hmrSocket instanceof NativeWebSocket);
  assert.ok(hmrSocket instanceof browserWindow.WebSocket);
  assert.equal(browserWindow.WebSocket.CONNECTING, NativeWebSocket.CONNECTING);
  assert.equal(hmrSocket.protocolsArgument, hmrProtocols, "WebSocket overload is preserved");
  const hmrUrl = new URL(hmrSocket.url);
  assert.equal(hmrUrl.searchParams.get("id"), tag.documentId);
  const viewerId = hmrUrl.searchParams.get("__sm_viewer");
  assert.match(viewerId ?? "", /^smv_[0-9a-f-]{36}$/i);
  assert.notEqual(viewerId, "spoofed", "host viewer overwrites a spoofed HMR value");
  const appSocketUrl = `${currentUrl.protocol === "https:" ? "wss:" : "ws:"}//${currentUrl.host}${tag.chatPath}/app-socket?id=${encodeURIComponent(tag.documentId)}`;
  const appSocket = new browserWindow.WebSocket(appSocketUrl);
  assert.equal(appSocket.url, appSocketUrl, "app WebSockets remain untouched");
  const externalSocketUrl = `wss://example.com${tag.chatPath}/_next/webpack-hmr?id=${encodeURIComponent(tag.documentId)}`;
  const externalSocket = new browserWindow.WebSocket(externalSocketUrl);
  assert.equal(externalSocket.url, externalSocketUrl, "cross-origin HMR remains untouched");
  return {
    tag,
    context,
    browserWindow,
    viewerId,
    stableHmrId: tag.documentId,
    hmrUrl: hmrUrl.toString(),
    openedSockets,
    currentUrl,
    replacedUrl,
  };
}

function executeMockNextBootstrap(page, browser) {
  const source = page.body.match(
    /<script nonce="preview-test">(self\.__mock_next_boot=[\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(source, "fixture contains the simulated Next bootstrap");
  runInNewContext(source, browser.context);
  return browser.browserWindow.__mock_next_boot;
}

async function websocketOpen(pathname, extraHeaders = {}) {
  const socket = net.createConnection({ host: "127.0.0.1", port: hostAddress.port });
  await once(socket, "connect");
  const headers = [
    `GET ${pathname} HTTP/1.1`,
    `Host: 127.0.0.1:${hostAddress.port}`,
    "Connection: Upgrade",
    "Upgrade: websocket",
    "Sec-WebSocket-Version: 13",
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
    ...Object.entries(extraHeaders).map(([name, value]) => `${name}: ${value}`),
    "",
    "",
  ];
  socket.write(headers.join("\r\n"));
  let response = Buffer.alloc(0);
  while (!response.includes(Buffer.from("\r\n\r\n"))) {
    const [chunk] = await once(socket, "data");
    response = Buffer.concat([response, chunk]);
  }
  const headerEnd = response.indexOf(Buffer.from("\r\n\r\n")) + 4;
  return {
    socket,
    response: response.subarray(0, headerEnd).toString("latin1"),
    extra: response.subarray(headerEnd),
  };
}

async function websocketHandshake(pathname) {
  const connection = await websocketOpen(pathname);
  connection.socket.destroy();
  return connection.response;
}

async function malformedWebsocketWithoutKey(pathname) {
  const socket = net.createConnection({ host: "127.0.0.1", port: hostAddress.port });
  await once(socket, "connect");
  socket.write(
    [
      `GET ${pathname} HTTP/1.1`,
      `Host: 127.0.0.1:${hostAddress.port}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"),
  );
  await new Promise((resolve) => {
    socket.once("close", resolve);
    socket.once("error", resolve);
  });
  if (!socket.destroyed) socket.destroy();
}

async function connectBrowserHmr(browser) {
  lastUpstreamUpgradeUrl = null;
  lastUpstreamUpgradeHeaders = null;
  const hmrUrl = new URL(browser.hmrUrl);
  const connection = await websocketOpen(`${hmrUrl.pathname}${hmrUrl.search}`, {
    Origin: hostBase,
  });
  assert.match(connection.response, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.ok(lastUpstreamUpgradeUrl, "candidate HMR reaches the runtime");
  const upstreamUrl = new URL(lastUpstreamUpgradeUrl, "http://runtime.invalid");
  assert.equal(
    upstreamUrl.searchParams.get("id"),
    browser.tag.documentId,
    "upstream HMR keeps Next's exact request/debug key",
  );
  assert.equal(
    upstreamUrl.searchParams.has("__sm_viewer"),
    false,
    "stable host viewer metadata is stripped before upstream HMR",
  );
  assert.equal(lastUpstreamUpgradeHeaders?.origin, undefined);
  return connection;
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

  // Origin-strip contract (HTTP path mirrors the WS upgrade path): internal
  // Next-paths must reach upstream WITHOUT an `Origin` header so Next 16's
  // `blockCrossSiteDEV` does not 403 dev-overlay assets (e.g. the root-absolute
  // `/__nextjs_font/geist-latin.woff2`). App-owned routes keep their `Origin`.
  // Each case asserts the request actually reached upstream (status 200 +
  // recorded url) so the "Origin is undefined" checks cannot pass falsely on a
  // request that never got proxied (e.g. a 404/starting page).
  runtime.__testing.clearRuntimeStateForTesting(ordinary.chatId, ordinary.sessionId);
  const originSession = writeSession({ chatId: "origin-strip" });
  const flyOrigin = "https://vm-fly-jakem.fly.dev";

  // Reserved viewer identity belongs to the host and must never alter the
  // generated app's searchParams/runtime behavior. Receipt of a navigation is
  // not an ACK: only a clean downstream document plus its exact browser HMR
  // identity can acknowledge the pending generation.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
  );
  const viewerAssetBeforeDocument = await rawGet(
    `/${originSession.chatId}/_next/static/pre-document.js`,
    {
      Referer: `${hostBase}/${originSession.chatId}/?__sm_viewer=${viewerA}`,
    },
  );
  assert.equal(viewerAssetBeforeDocument.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
    "a viewer id recovered only from an asset Referer must not ACK the document reload",
  );
  const viewerDecoratedScript = await rawGet(
    `/${originSession.chatId}/_next/static/explicit-viewer.js?__sm_viewer=${viewerA}`,
    {
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Dest": "script",
    },
  );
  assert.equal(viewerDecoratedScript.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.doesNotMatch(viewerDecoratedScript.body, /data-sajtmaskin-preview-bootstrap/);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
    "an explicit viewer query on a script request must not ACK",
  );
  const viewerDecoratedRsc = await rawGet(
    `/${originSession.chatId}/products?__sm_viewer=${viewerA}`,
    {
      RSC: "1",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
    },
  );
  assert.equal(viewerDecoratedRsc.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
    "an explicit viewer query on an RSC request must not ACK",
  );
  const viewerDecoratedApi = await rawGet(
    `/${originSession.chatId}/api/data?__sm_viewer=${viewerA}`,
    {
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
    },
  );
  assert.equal(viewerDecoratedApi.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
    "an explicit viewer query on an API request must not ACK",
  );
  const viewerDecoratedAction = await rawRequest(
    `/${originSession.chatId}/products?__sm_viewer=${viewerA}`,
    {
      method: "POST",
      headers: {
        "Next-Action": "action-id",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Content-Type": "text/plain",
      },
      body: "action-body",
    },
  );
  assert.equal(viewerDecoratedAction.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    true,
    "an explicit viewer query on a Server Action must not seed or ACK",
  );
  const viewerWithoutFetchMetadata = await rawGet(
    `/${originSession.chatId}/legacy-view?__sm_viewer=viewer-legacy`,
  );
  assert.equal(viewerWithoutFetchMetadata.status, 200);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-request-id"], undefined);
  assert.equal(lastUpstreamHeaders?.["x-nextjs-html-request-id"], undefined);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      "viewer-legacy",
    ),
    true,
    "missing Fetch Metadata is handled conservatively and must not ACK",
  );
  lastUpstreamUrl = null;
  const viewerDecoratedPage = await rawGet(
    `/${originSession.chatId}/products?category=boots&__sm_refresh=17&inspect=1&__sm_viewer=${viewerA}`,
    {
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Dest": "iframe",
    },
  );
  assert.equal(viewerDecoratedPage.status, 200);
  assert.equal(viewerDecoratedPage.headers["content-security-policy"], upstreamCsp);
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/products?category=boots`);
  assert.match(lastUpstreamHeaders?.["x-nextjs-request-id"] ?? "", /^smd_[0-9a-f-]{36}$/i);
  assert.equal(
    lastUpstreamHeaders?.["x-nextjs-html-request-id"],
    lastUpstreamHeaders?.["x-nextjs-request-id"],
  );
  const bootstrapStart = viewerDecoratedPage.body.indexOf(
    "data-sajtmaskin-preview-bootstrap",
  );
  const nextBootStart = viewerDecoratedPage.body.indexOf("self.__mock_next_boot");
  assert.ok(bootstrapStart >= 0, "viewer navigation injects the host bootstrap");
  assert.ok(
    bootstrapStart < nextBootStart,
    "viewer bootstrap executes before Next's first bootstrap script",
  );
  const firstBootstrapTag = extractBootstrapTag(viewerDecoratedPage.body);
  assert.equal(
    firstBootstrapTag.bootstrapSrc,
    `/${originSession.chatId}/__sm/preview-bootstrap.js`,
  );
  assert.equal(
    firstBootstrapTag.nonce,
    "preview-test",
    "bootstrap inherits Next's nonce without weakening the original CSP",
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "successful response receipt alone does not ACK before bootstrap executes",
  );
  const viewerStorage = new Map([
    [`sajtmaskin:preview-viewer:${originSession.chatId}`, viewerDocument],
  ]);
  const firstBrowser = await executePreviewBootstrap({
    page: viewerDecoratedPage,
    browserUrl: `${hostBase}/${originSession.chatId}/products?category=boots&__sm_refresh=17&inspect=1&__sm_viewer=${viewerA}#details`,
    sessionStorage: viewerStorage,
    mintedUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(firstBrowser.viewerId, viewerA, "explicit builder viewer wins over storage/mint");
  assert.equal(
    firstBrowser.replacedUrl,
    `/${originSession.chatId}/products?category=boots&inspect=1#details`,
    "bootstrap removes identity/refresh metadata while preserving inspect mode",
  );
  assert.equal(
    executeMockNextBootstrap(viewerDecoratedPage, firstBrowser),
    "?category=boots&inspect=1",
    "inspect remains available across hard reload/MPA while upstream SSR stays clean",
  );
  assert.deepEqual(
    runtime.__testing.previewHmrIdentityFromSearch(new URL(firstBrowser.hmrUrl).search),
    { viewerId: viewerA, documentId: firstBrowser.tag.documentId },
    "HMR keeps stable viewer separate from Next's exact document/debug identity",
  );
  assert.match(
    viewerDecoratedPage.body,
    /<script src="https:\/\/app\.example\/api\/inspect-bridge\?parent=https%3A%2F%2Fapp\.example" defer nonce="preview-test"><\/script>/,
    "inspector bridge inherits the response nonce",
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "downstream finish alone cannot ACK before the browser opens exact HMR",
  );
  const firstHmrUrl = new URL(firstBrowser.hmrUrl);
  process.env.SAJTMASKIN_PREVIEW_HMR_PROXY = "false";
  try {
    await malformedWebsocketWithoutKey(`${firstHmrUrl.pathname}${firstHmrUrl.search}`);
  } finally {
    process.env.SAJTMASKIN_PREVIEW_HMR_PROXY = "true";
  }
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "a malformed pre-101 HMR attempt cannot ACK the viewer",
  );
  const firstHmr = await connectBrowserHmr(firstBrowser);
  firstHmr.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      viewerA,
    ),
    false,
    "successful downstream finish plus exact HMR viewer proof ACKs the generation",
  );

  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const rejectedHmrPage = await rawGet(
    `/${originSession.chatId}/upstream-reject?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  const rejectedHmrBrowser = await executePreviewBootstrap({
    page: rejectedHmrPage,
    browserUrl: `${hostBase}/${originSession.chatId}/upstream-reject?__sm_viewer=${viewerA}`,
    sessionStorage: new Map(),
    mintedUuid: "adadadad-0000-4000-8000-000000000009",
  });
  rejectNextUpgrade = true;
  const rejectedHmrUrl = new URL(rejectedHmrBrowser.hmrUrl);
  const rejectedHmr = await websocketOpen(
    `${rejectedHmrUrl.pathname}${rejectedHmrUrl.search}`,
  );
  assert.match(rejectedHmr.response, /^HTTP\/1\.1 403 Forbidden/m);
  if (!rejectedHmr.socket.destroyed) await once(rejectedHmr.socket, "close");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "an upstream-rejected HMR handshake cannot ACK the viewer",
  );
  for (let spin = 0; spin < 20; spin += 1) {
    if (runtime.__testing.pendingPreviewDocumentCount() === 0) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    runtime.__testing.pendingPreviewDocumentCount(),
    0,
    "a rejected provisional HMR candidate is released immediately",
  );

  // Normal documents must expose their streamed shell before a delayed tail.
  // HMR may connect during that delay, but the exact generation remains
  // pending until the main downstream response itself finishes successfully.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const delayedStarted = new Promise((resolve) => {
    delayedTailStarted = resolve;
  });
  const delayedStream = await openStreamingGet(
    `/${originSession.chatId}/delayed-tail?inspect=1&__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  await delayedStarted;
  const delayedShell = await delayedStream.waitForText("SHELL_VISIBLE");
  assert.match(delayedShell, /data-sajtmaskin-preview-bootstrap/);
  assert.match(delayedShell, /api\/inspect-bridge/);
  assert.doesNotMatch(delayedShell, /DELAYED_TAIL/);
  const delayedBrowser = await executePreviewBootstrap({
    page: { body: delayedShell },
    browserUrl: `${hostBase}/${originSession.chatId}/delayed-tail?inspect=1&__sm_viewer=${viewerA}`,
    sessionStorage: new Map(),
    mintedUuid: "abababab-0000-4000-8000-000000000007",
  });
  const delayedHmr = await connectBrowserHmr(delayedBrowser);
  assert.equal(delayedHmr.extra.length, 0, "candidate HMR receives no stale reload frame");
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "HMR proof before downstream finish remains pending",
  );
  assert.equal(typeof releaseDelayedTail, "function");
  releaseDelayedTail();
  const delayedResult = await delayedStream.done;
  assert.equal(delayedResult.aborted, false);
  assert.equal(delayedResult.complete, true);
  assert.match(delayedResult.body, /DELAYED_TAIL/);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    false,
    "downstream finish completes the already-observed HMR candidate",
  );
  delayedHmr.socket.destroy();

  // A browser that disconnects after receiving the shell must not consume the
  // pending generation. Releasing its provisional HMR socket retries exactly
  // one reload instead of treating the truncated document as committed.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const abortStarted = new Promise((resolve) => {
    delayedTailStarted = resolve;
  });
  const abortStream = await openStreamingGet(
    `/${originSession.chatId}/delayed-tail?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  await abortStarted;
  const abortShell = await abortStream.waitForText("SHELL_VISIBLE");
  const abortBrowser = await executePreviewBootstrap({
    page: { body: abortShell },
    browserUrl: `${hostBase}/${originSession.chatId}/delayed-tail?__sm_viewer=${viewerA}`,
    sessionStorage: new Map(),
    mintedUuid: "acacacac-0000-4000-8000-000000000008",
  });
  const abortHmr = await connectBrowserHmr(abortBrowser);
  const reloadAfterAbort = Promise.race([
    once(abortHmr.socket, "data").then(([frame]) => frame),
    new Promise((_, reject) => setTimeout(() => reject(new Error("missing reload after abort")), 500)),
  ]);
  abortStream.abort();
  const abortResult = await abortStream.done;
  assert.equal(abortResult.aborted, true);
  const reloadFrame = await reloadAfterAbort;
  assert.match(reloadFrame.toString("utf8"), /preview-runtime-swap/);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "downstream abort releases the candidate without ACK",
  );
  if (releaseDelayedTail) releaseDelayedTail();
  abortHmr.socket.destroy();

  // A hard reload/MPA after identity cleanup has no viewer/refresh query.
  // Inspect remains explicit in the browser URL, while the bootstrap recovers
  // the same per-tab ID and each document receives a fresh Next request id.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const reloadedPage = await rawGet(
    `/${originSession.chatId}/products?category=boots&inspect=1`,
    {
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Dest": "iframe",
    },
  );
  const reloadedBrowser = await executePreviewBootstrap({
    page: reloadedPage,
    browserUrl: `${hostBase}/${originSession.chatId}/products?category=boots&inspect=1#details`,
    sessionStorage: viewerStorage,
    mintedUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.equal(reloadedBrowser.viewerId, viewerA, "hard reload reuses the same tab viewer");
  assert.notEqual(
    reloadedBrowser.tag.documentId,
    firstBrowser.tag.documentId,
    "each rendered document retains its own Next debug/request identity",
  );
  assert.equal(
    executeMockNextBootstrap(reloadedPage, reloadedBrowser),
    "?category=boots&inspect=1",
  );
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/products?category=boots`);
  assert.match(reloadedPage.body, /api\/inspect-bridge/);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
  );
  const reloadedHmr = await connectBrowserHmr(reloadedBrowser);
  reloadedHmr.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    false,
    "the clean-URL reload ACK stops an HMR reconnect loop",
  );

  // Canonical open-new-tab URLs intentionally carry no host query. With
  // noopener each tab has independent sessionStorage, so each mints and keeps
  // its own viewer instead of sharing a chat-global anonymous one-shot.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const canonicalPageA = await rawGet(`/${originSession.chatId}/canonical-a`, {
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
  });
  const canonicalPageB = await rawGet(`/${originSession.chatId}/canonical-b`, {
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
  });
  const canonicalTabA = await executePreviewBootstrap({
    page: canonicalPageA,
    browserUrl: `${hostBase}/${originSession.chatId}/canonical-a`,
    sessionStorage: new Map(),
    mintedUuid: "aaaaaaaa-0000-4000-8000-000000000001",
  });
  const canonicalTabB = await executePreviewBootstrap({
    page: canonicalPageB,
    browserUrl: `${hostBase}/${originSession.chatId}/canonical-b`,
    sessionStorage: new Map(),
    mintedUuid: "bbbbbbbb-0000-4000-8000-000000000002",
  });
  assert.notEqual(canonicalTabA.viewerId, canonicalTabB.viewerId);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      canonicalTabA.viewerId,
    ),
    true,
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      canonicalTabB.viewerId,
    ),
    true,
  );
  const canonicalHmrA = await connectBrowserHmr(canonicalTabA);
  canonicalHmrA.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      canonicalTabA.viewerId,
    ),
    false,
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      canonicalTabB.viewerId,
    ),
    true,
    "tab A's exact HMR proof does not consume tab B's reload",
  );
  const canonicalHmrB = await connectBrowserHmr(canonicalTabB);
  canonicalHmrB.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(
      originSession.chatId,
      canonicalTabB.viewerId,
    ),
    false,
    "both real tabs ACK independently with no third stale delivery",
  );

  // A successful document can be delayed across another runtime replacement.
  // Its one-shot document token is bound to the generation captured when the
  // request began, so its late HMR proof cannot suppress the newer reload.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const staleGenerationPage = await rawGet(
    `/${originSession.chatId}/stale-generation?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  const staleGenerationBrowser = await executePreviewBootstrap({
    page: staleGenerationPage,
    browserUrl: `${hostBase}/${originSession.chatId}/stale-generation?__sm_viewer=${viewerA}`,
    sessionStorage: new Map(),
    mintedUuid: "eeeeeeee-0000-4000-8000-000000000005",
  });
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const staleHmrUrl = new URL(staleGenerationBrowser.hmrUrl);
  const upstreamBeforeStaleHmr = upstreamUpgradeHits;
  const staleHmr = await websocketOpen(`${staleHmrUrl.pathname}${staleHmrUrl.search}`);
  staleHmr.socket.destroy();
  assert.equal(
    upstreamUpgradeHits,
    upstreamBeforeStaleHmr,
    "generation N's HMR is stubbed instead of joining generation N+1",
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "generation N's late HMR cannot ACK generation N+1",
  );
  const currentGenerationPage = await rawGet(
    `/${originSession.chatId}/current-generation`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  const currentGenerationBrowser = await executePreviewBootstrap({
    page: currentGenerationPage,
    browserUrl: `${hostBase}/${originSession.chatId}/current-generation`,
    sessionStorage: new Map([[`sajtmaskin:preview-viewer:${originSession.chatId}`, viewerA]]),
    mintedUuid: "ffffffff-0000-4000-8000-000000000006",
  });
  const currentGenerationHmr = await connectBrowserHmr(currentGenerationBrowser);
  currentGenerationHmr.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    false,
    "only generation N+1's own finished document/HMR pair consumes it",
  );

  // Redirect before bootstrap execution must carry an explicit embedded
  // viewer only across a relative/same-origin Location. External redirects
  // never receive host-owned metadata.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const localRedirect = await rawGet(
    `/${originSession.chatId}/redirect-local?inspect=1&__sm_viewer=${viewerDocument}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(localRedirect.status, 302);
  assert.equal(
    localRedirect.headers.location,
    `/${originSession.chatId}/redirect-target?app=1&__sm_viewer=${encodeURIComponent(viewerDocument)}&inspect=1`,
  );
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerDocument),
    true,
    "redirect receipt cannot ACK before a final document executes",
  );
  const redirectedPage = await rawGet(localRedirect.headers.location, {
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "iframe",
  });
  const redirectedBrowser = await executePreviewBootstrap({
    page: redirectedPage,
    browserUrl: `${hostBase}${localRedirect.headers.location}`,
    sessionStorage: new Map(),
    mintedUuid: "cccccccc-0000-4000-8000-000000000003",
  });
  assert.equal(redirectedBrowser.viewerId, viewerDocument);
  assert.match(redirectedPage.body, /api\/inspect-bridge/);
  const redirectedHmr = await connectBrowserHmr(redirectedBrowser);
  redirectedHmr.socket.destroy();
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerDocument),
    false,
  );
  const externalRedirect = await rawGet(
    `/${originSession.chatId}/redirect-external?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(externalRedirect.status, 302);
  assert.equal(externalRedirect.headers.location, "https://example.com/elsewhere?app=1");
  for (const [route, expectedLocation] of [
    ["redirect-other-chat", "/another-chat/target?app=1"],
    ["redirect-parent", "../escaped?app=1"],
    ["redirect-backslash", "\\\\evil.example/path?app=1"],
  ]) {
    const escapedRedirect = await rawGet(
      `/${originSession.chatId}/${route}?__sm_viewer=${viewerA}`,
      { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
    );
    assert.equal(escapedRedirect.status, 302);
    assert.equal(
      escapedRedirect.headers.location,
      expectedLocation,
      `${route} must not carry a viewer outside the current chat namespace`,
    );
    assert.doesNotMatch(escapedRedirect.headers.location, /__sm_viewer/);
  }

  // 204/5xx and aborted streams cannot form a finished document/HMR pair, so the same
  // viewer stays pending and will be retried on its next HMR socket.
  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const noContent = await rawGet(
    `/${originSession.chatId}/no-content?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(noContent.status, 204);
  assert.doesNotMatch(noContent.body, /data-sajtmaskin-preview-bootstrap/);
  const serverFail = await rawGet(
    `/${originSession.chatId}/server-fail?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(serverFail.status, 500);
  assert.doesNotMatch(serverFail.body, /data-sajtmaskin-preview-bootstrap/);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
  );

  runtime.__testing.clearPendingPreviewClientReload(originSession.chatId);
  const cspPrecedencePage = await rawGet(
    `/${originSession.chatId}/csp-precedence?inspect=1&__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  const cspPrecedenceTag = extractBootstrapTag(cspPrecedencePage.body);
  assert.equal(
    cspPrecedenceTag.nonce,
    "right",
    "script-src-elem supplies the effective nonce ahead of script-src",
  );
  assert.match(
    cspPrecedencePage.body,
    /api\/inspect-bridge[^>]+defer nonce="right"/,
  );
  const cspDuplicatePage = await rawGet(
    `/${originSession.chatId}/csp-duplicate-script-src?inspect=1&__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(
    extractBootstrapTag(cspDuplicatePage.body).nonce,
    "real",
    "duplicate script-src keeps the first nonce, matching CSP first-wins",
  );
  const cspReportOnlyPage = await rawGet(
    `/${originSession.chatId}/csp-report-only?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(
    extractBootstrapTag(cspReportOnlyPage.body).nonce,
    "",
    "Report-Only nonce never authorizes the injected bootstrap",
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const delayedHeadersStarted = new Promise((resolve) => {
      delayedHeaderRequestStarted = () => {
        delayedHeaderRequestStarted = null;
        resolve();
      };
    });
    const abortedBeforeHeaders = http.request({
      host: "127.0.0.1",
      port: hostAddress.port,
      path: `/${originSession.chatId}/delayed-headers?__sm_viewer=${viewerA}`,
      headers: { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
    });
    abortedBeforeHeaders.on("response", (response) => response.resume());
    abortedBeforeHeaders.on("error", () => {});
    abortedBeforeHeaders.end();
    await delayedHeadersStarted;
    assert.equal(runtime.__testing.pendingPreviewDocumentCount(), 1);
    abortedBeforeHeaders.destroy();
    for (let spin = 0; spin < 20; spin += 1) {
      if (runtime.__testing.pendingPreviewDocumentCount() === 0) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(
      runtime.__testing.pendingPreviewDocumentCount(),
      0,
      "navigation abort before upstream headers releases its pending document",
    );
    if (releaseDelayedHeaders) releaseDelayedHeaders();
  }

  // The bounded head transform inserts only the ASCII host tag. Original
  // upstream bytes—including a four-byte character split across later chunks—
  // remain identical after removing that tag.
  const largePage = await rawGet(
    `/${originSession.chatId}/large-stream?__sm_viewer=${viewerA}`,
    { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
  );
  assert.equal(largePage.status, 200);
  const largeTag = extractBootstrapTag(largePage.body);
  const tagByteLength = Buffer.byteLength(largeTag.markup, "utf8");
  const withoutInjectedTag = Buffer.concat([
    largePage.bodyBuffer.subarray(0, largeTag.index),
    largePage.bodyBuffer.subarray(largeTag.index + tagByteLength),
  ]);
  assert.deepEqual(
    withoutInjectedTag,
    Buffer.concat([largePrefix, splitEmoji, largeDocumentTail]),
    "large response injection is byte-safe across split UTF-8 chunks",
  );
  const largeBrowser = await executePreviewBootstrap({
    page: largePage,
    browserUrl: `${hostBase}/${originSession.chatId}/large-stream?__sm_viewer=${viewerA}`,
    sessionStorage: new Map(),
    mintedUuid: "dddddddd-0000-4000-8000-000000000004",
  });
  const largeHmr = await connectBrowserHmr(largeBrowser);
  largeHmr.socket.destroy();

  runtime.__testing.markPendingPreviewClientReload(originSession.chatId);
  const abortedLargePage = await rawRequestAllowAbort(
    `/${originSession.chatId}/large-error?__sm_viewer=${viewerA}`,
    {
      headers: { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
    },
  );
  assert.equal(abortedLargePage.status, 200);
  assert.equal(abortedLargePage.aborted, true);
  assert.equal(abortedLargePage.complete, false);
  assert.equal(
    runtime.__testing.hasPendingPreviewClientReload(originSession.chatId, viewerA),
    true,
    "an upstream stream error aborts downstream and cannot consume the ACK",
  );

  const unknownBootstrap = await rawGet(`/unknown-chat${"/__sm/preview-bootstrap.js"}`);
  assert.equal(unknownBootstrap.status, 404, "reserved host scripts require a live session");

  // (a) chatId-prefixed internal asset -> Origin stripped before upstream.
  lastUpstreamHeaders = null;
  lastUpstreamUrl = null;
  const nextAsset = await rawGet(`/${originSession.chatId}/_next/static/chunk.js`, {
    Origin: flyOrigin,
  });
  assert.equal(nextAsset.status, 200);
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/_next/static/chunk.js`);
  assert.equal(
    lastUpstreamHeaders?.origin,
    undefined,
    "internal /_next path must have Origin stripped before upstream",
  );

  // (b) Root-absolute dev-overlay font (no chatId prefix) resolved via the
  // Referer fallback -> proxied to the chat's runtime with Origin stripped.
  // This is the real repro from the console 403 report.
  lastUpstreamHeaders = null;
  lastUpstreamUrl = null;
  const overlayFont = await rawGet(`/__nextjs_font/geist-latin.woff2`, {
    Origin: flyOrigin,
    Referer: `${hostBase}/${originSession.chatId}/`,
  });
  assert.equal(overlayFont.status, 200);
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/__nextjs_font/geist-latin.woff2`);
  assert.equal(
    lastUpstreamHeaders?.origin,
    undefined,
    "referer-fallback /__nextjs path must have Origin stripped before upstream",
  );

  // (c) App-owned route -> Origin preserved (only Next-internal paths stripped).
  lastUpstreamHeaders = null;
  lastUpstreamUrl = null;
  const appRoute = await rawGet(`/${originSession.chatId}/api/data`, { Origin: flyOrigin });
  assert.equal(appRoute.status, 200);
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/api/data`);
  assert.equal(
    lastUpstreamHeaders?.origin,
    flyOrigin,
    "app-owned route must keep its Origin header",
  );

  // (d) Generated clients intentionally use deploy-portable root API URLs.
  // In multiplexed preview the Referer supplies the missing chatId prefix.
  const requestBody = JSON.stringify({ message: "Vilka skor passar för regn?" });
  lastUpstreamHeaders = null;
  lastUpstreamUrl = null;
  lastUpstreamMethod = null;
  lastUpstreamBody = null;
  const rootApi = await rawRequest(`/api/chat?mode=demo`, {
    method: "POST",
    headers: {
      Origin: flyOrigin,
      Referer: `${hostBase}/${originSession.chatId}/skor`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody),
    },
    body: requestBody,
  });
  assert.equal(rootApi.status, 200);
  assert.equal(lastUpstreamUrl, `/${originSession.chatId}/api/chat?mode=demo`);
  assert.equal(lastUpstreamMethod, "POST");
  assert.equal(lastUpstreamBody, requestBody);
  assert.equal(
    lastUpstreamHeaders?.origin,
    flyOrigin,
    "app-owned root API route must keep its Origin header",
  );

  // No Referer means no owning preview. Never guess or route to another chat.
  lastUpstreamUrl = null;
  const unscopedApi = await rawRequest(`/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });
  assert.equal(unscopedApi.status, 404);
  assert.equal(lastUpstreamUrl, null);

  console.log("[test-preview-proxy-contract] All proxy contracts green.");
} finally {
  for (const chatId of [
    "prewarm-running",
    "prewarm-failed",
    "replacement-running",
    "replacement-failed",
    "ordinary-last-good",
    "origin-strip",
  ]) {
    runtime.__testing.clearRuntimeStateForTesting(chatId, `session-${chatId}`);
  }
  host.close();
  host.closeAllConnections?.();
  host.closeIdleConnections?.();
  for (const socket of upstreamUpgradeSockets) socket.destroy();
  upstream.close();
  upstream.closeAllConnections?.();
  upstream.closeIdleConnections?.();
  await new Promise((resolve) => setTimeout(resolve, 50));
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.SAJTMASKIN_PREVIEW_HMR_PROXY;
}
