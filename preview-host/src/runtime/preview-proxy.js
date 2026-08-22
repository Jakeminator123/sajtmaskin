"use strict";

// Preview-proxy/inspect: HTTP-/WS-proxning till dev-runtimen, HMR-stub/-proxy,
// prewarm-hold-sidor och inspector-bridge-injektion. Ren extraktion ur
// runtime.js — ingen beteendeändring.

const { createHash, randomUUID } = require("node:crypto");
const httpProxy = require("http-proxy");

const { readStoreSync } = require("./../store.js");
const {
  LOOPBACK,
  acknowledgePreviewClientReload,
  clearPreviewSocketCandidate,
  findSessionByChatId,
  getPendingPreviewClientReloadToken,
  getSessionChatId,
  hasPendingPreviewClientReload,
  isHmrProxyEnabled,
  markPreviewSocketHandshakeComplete,
  registerPreviewSocket,
  requestPreviewClientReload,
  routeInfoFromPathname,
  runtimeChildren,
} = require("./shared.js");
const {
  ensureRuntimeForChat,
  getRuntimeStateForChat,
  queueRuntimeBoot,
} = require("./process-lifecycle.js");

// Betrodda parent-origins för den alltid aktiva route-bryggan. De kommer bara
// från hostens egen env och normaliseras till exakta HTTP(S)-origins. Att skicka
// samma signal till varje explicit tillåten origin är säkert: webbläsaren
// levererar den bara när den faktiska parent-origin matchar targetOrigin.
function configuredAppOrigins(rawValue) {
  const origins = new Set();
  for (const candidate of String(rawValue || "").split(",")) {
    try {
      const parsed = new URL(candidate.trim());
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin === "null") continue;
      origins.add(parsed.origin);
    } catch {
      // Invalid entries fail closed.
    }
  }
  return [...origins];
}

const APP_ORIGINS = configuredAppOrigins(
  process.env.SAJTMASKIN_APP_ORIGINS || process.env.SAJTMASKIN_APP_ORIGIN,
);
// Inspector-scriptet behöver fortfarande en enda canonical app-origin. Första
// posten äger det kontraktet; route-bryggan använder hela allowlisten.
const INSPECT_APP_ORIGIN = APP_ORIGINS[0] || "";
const PREVIEW_VIEWER_QUERY_PARAM = "__sm_viewer";
const PREVIEW_REFRESH_QUERY_PARAM = "__sm_refresh";
const PREVIEW_INSPECT_QUERY_PARAM = "inspect";
const PREVIEW_HOST_QUERY_PARAMS = [
  PREVIEW_VIEWER_QUERY_PARAM,
  PREVIEW_REFRESH_QUERY_PARAM,
  PREVIEW_INSPECT_QUERY_PARAM,
];
const PREVIEW_BROWSER_CLEANUP_QUERY_PARAMS = [
  PREVIEW_VIEWER_QUERY_PARAM,
  PREVIEW_REFRESH_QUERY_PARAM,
];
const PREVIEW_VIEWER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW_VIEWER_UUID_SOURCE =
  "smv_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PREVIEW_DOCUMENT_UUID_SOURCE =
  "smd_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PREVIEW_VIEWER_ID_RE_MINTED = new RegExp(`^${PREVIEW_VIEWER_UUID_SOURCE}$`, "i");
const PREVIEW_DOCUMENT_ID_RE = new RegExp(`^${PREVIEW_DOCUMENT_UUID_SOURCE}$`, "i");
const NEXT_REQUEST_ID_HEADER = "x-nextjs-request-id";
const NEXT_HTML_REQUEST_ID_HEADER = "x-nextjs-html-request-id";
const PREVIEW_BOOTSTRAP_PATH = "/__sm/preview-bootstrap.js";
const PREVIEW_DOCUMENT_HMR_TTL_MS = 2 * 60 * 1000;
const PREVIEW_HEAD_SCAN_MAX_BYTES = 64 * 1024;
/**
 * HMR-endpointer som browser-bootstrapen ska märka med `__sm_viewer`.
 *
 * Next 16.3 bytte `/_next/webpack-hmr` mot `/_next/hmr`. En genererad sajt kan
 * ligga kvar på en äldre Next, så listan bär alla tre. Missar den den aktuella
 * sökvägen sätts viewer-id aldrig, och reload-signalen kan inte scopas per
 * flik — se `SM-062`. Speglar {@link HMR_PATH_RE} på serversidan.
 */
const PREVIEW_HMR_PATH_SUFFIXES = [
  "/_next/hmr",
  "/_next/webpack-hmr",
  "/_next/turbopack-hmr",
];
const pendingPreviewDocuments = new Map();
const PREVIEW_BOOTSTRAP_SCRIPT = `(function(){try{
var script=document.currentScript;if(!script)return;
var documentId=script.getAttribute("data-document-id");
var storageKey=script.getAttribute("data-storage-key");
var chatPath=script.getAttribute("data-chat-path")||"";
var previewSessionId=script.getAttribute("data-preview-session-id")||"";
var versionId=script.getAttribute("data-version-id")||"";
var appOriginsRaw=script.getAttribute("data-app-origins")||"";
var viewerPattern=/^${PREVIEW_VIEWER_UUID_SOURCE}$/i;
var pageUrl=new URL(window.location.href);
var viewer=pageUrl.searchParams.get("${PREVIEW_VIEWER_QUERY_PARAM}");
if(!viewerPattern.test(viewer||""))viewer=null;
try{var stored=window.sessionStorage.getItem(storageKey);if(!viewer&&viewerPattern.test(stored||""))viewer=stored;}catch(_){}
if(!viewer){var uuid=window.crypto&&typeof window.crypto.randomUUID==="function"?window.crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(token){var random=Math.floor(Math.random()*16);return(token==="x"?random:(random&3)|8).toString(16)});viewer="smv_"+uuid;}
try{window.sessionStorage.setItem(storageKey,viewer)}catch(_){}
var cleanupParams=${JSON.stringify(PREVIEW_BROWSER_CLEANUP_QUERY_PARAMS)};var hadHostParams=cleanupParams.some(function(name){return pageUrl.searchParams.has(name)});cleanupParams.forEach(function(name){pageUrl.searchParams.delete(name)});if(hadHostParams){window.history.replaceState(window.history.state,"",pageUrl.pathname+pageUrl.search+pageUrl.hash)}
var appOrigins=[];appOriginsRaw.split(",").forEach(function(candidate){try{var parsed=new URL(candidate.trim());if(/^https?:$/.test(parsed.protocol)&&parsed.origin!=="null"&&appOrigins.indexOf(parsed.origin)===-1)appOrigins.push(parsed.origin)}catch(_){}});
function postRouteChange(){try{if(window.parent===window||appOrigins.length===0||!previewSessionId||!versionId||!viewer)return;var message={type:"sajtmaskin:preview:route-change",source:"sajtmaskin-preview-host",payload:{href:window.location.href,previewSessionId:previewSessionId,versionId:versionId,viewerId:viewer}};appOrigins.forEach(function(appOrigin){window.parent.postMessage(message,appOrigin)})}catch(_){} }
function wrapHistory(name){var native=window.history&&window.history[name];if(typeof native!=="function")return;window.history[name]=function(){var result=native.apply(this,arguments);postRouteChange();return result}}
wrapHistory("pushState");wrapHistory("replaceState");
if(typeof window.addEventListener==="function"){window.addEventListener("popstate",postRouteChange);window.addEventListener("hashchange",postRouteChange)}
postRouteChange();
var NativeWebSocket=window.WebSocket;if(typeof NativeWebSocket==="function"&&typeof Proxy==="function"){window.WebSocket=new Proxy(NativeWebSocket,{construct:function(Target,args,NewTarget){try{var socketUrl=new URL(String(args[0]),window.location.href);var expectedProtocol=window.location.protocol==="https:"?"wss:":"ws:";var prefix=chatPath.endsWith("/")?chatPath.slice(0,-1):chatPath;var hmrSuffixes=${JSON.stringify(PREVIEW_HMR_PATH_SUFFIXES)};var hmrPath=hmrSuffixes.some(function(suffix){var full=prefix+suffix;return socketUrl.pathname===full||socketUrl.pathname.indexOf(full+"/")===0});if(socketUrl.protocol===expectedProtocol&&socketUrl.host===window.location.host&&hmrPath&&socketUrl.searchParams.get("id")===documentId){socketUrl.searchParams.set("${PREVIEW_VIEWER_QUERY_PARAM}",viewer);args=Array.prototype.slice.call(args);args[0]=socketUrl.toString()}}catch(_){}return Reflect.construct(Target,args,NewTarget)},apply:function(Target,thisArg,args){return Reflect.apply(Target,thisArg,args)}})}
script.remove();
}catch(_){}})();`;

function createPendingPreviewDocument(chatId, sessionId) {
  const documentId = `smd_${randomUUID()}`;
  pendingPreviewDocuments.set(documentId, {
    chatId,
    sessionId,
    reloadToken: getPendingPreviewClientReloadToken(chatId),
    provisionalViewerId: null,
    viewerId: null,
    downstreamFinished: false,
    timeoutId: null,
  });
  return documentId;
}

function pendingPreviewDocumentCount() {
  return pendingPreviewDocuments.size;
}

function armPreviewDocumentPreResponseCleanup(req, res, documentState) {
  const cancelBeforeResponse = () => {
    if (documentState.responseStarted || documentState.cancelled) return;
    documentState.cancelled = true;
    discardPendingPreviewDocument(documentState.documentId, {
      releaseCandidate: true,
    });
  };
  req.once("aborted", cancelBeforeResponse);
  res.once("close", cancelBeforeResponse);
}

function discardPendingPreviewDocument(documentId, options = {}) {
  const state = pendingPreviewDocuments.get(documentId);
  if (!state) return null;
  if (state.timeoutId) clearTimeout(state.timeoutId);
  pendingPreviewDocuments.delete(documentId);
  clearPreviewSocketCandidate(state.chatId, documentId);
  if (
    options.releaseCandidate === true &&
    state.reloadToken &&
    getPendingPreviewClientReloadToken(state.chatId) === state.reloadToken
  ) {
    requestPreviewClientReload(state.chatId);
  }
  return state;
}

function maybeAcknowledgePreviewDocument(documentId, state) {
  if (
    pendingPreviewDocuments.get(documentId) !== state ||
    state.downstreamFinished !== true ||
    !state.viewerId
  ) {
    return false;
  }
  const currentGeneration = getPendingPreviewClientReloadToken(state.chatId);
  const acknowledgesCurrentGeneration = Boolean(
    state.reloadToken && currentGeneration === state.reloadToken,
  );
  const { viewerId, reloadToken, chatId } = state;
  discardPendingPreviewDocument(documentId);
  if (!acknowledgesCurrentGeneration) return false;
  return acknowledgePreviewClientReload(chatId, viewerId, reloadToken);
}

function markPreviewDocumentDownstreamFinished(documentId) {
  const state = pendingPreviewDocuments.get(documentId);
  if (!state) return false;
  state.downstreamFinished = true;
  if (maybeAcknowledgePreviewDocument(documentId, state)) return true;
  if (pendingPreviewDocuments.get(documentId) !== state) return false;
  if (
    !state.reloadToken ||
    getPendingPreviewClientReloadToken(state.chatId) !== state.reloadToken
  ) {
    discardPendingPreviewDocument(documentId);
    return false;
  }
  if (!state.timeoutId) {
    const timeoutId = setTimeout(() => {
      if (pendingPreviewDocuments.get(documentId) === state) {
        discardPendingPreviewDocument(documentId, { releaseCandidate: true });
      }
    }, PREVIEW_DOCUMENT_HMR_TTL_MS);
    timeoutId.unref?.();
    state.timeoutId = timeoutId;
  }
  return false;
}

function classifyPendingPreviewDocumentCandidate(chatId, sessionId, documentId, viewerId) {
  if (!PREVIEW_DOCUMENT_ID_RE.test(documentId || "")) return null;
  if (!PREVIEW_VIEWER_ID_RE_MINTED.test(viewerId || "")) return null;
  const state = pendingPreviewDocuments.get(documentId);
  if (!state || state.chatId !== chatId || state.sessionId !== sessionId) return null;
  const currentGeneration = getPendingPreviewClientReloadToken(chatId);
  if (!state.reloadToken || state.reloadToken !== currentGeneration) {
    discardPendingPreviewDocument(documentId);
    return null;
  }
  if (state.viewerId && state.viewerId !== viewerId) return null;
  if (state.provisionalViewerId && state.provisionalViewerId !== viewerId) return null;
  state.provisionalViewerId = viewerId;
  return state.reloadToken;
}

function isPendingPreviewDocumentCandidate(
  chatId,
  sessionId,
  documentId,
  viewerId,
  generationToken,
) {
  const state = pendingPreviewDocuments.get(documentId);
  return Boolean(
    state &&
      state.chatId === chatId &&
      state.sessionId === sessionId &&
      state.provisionalViewerId === viewerId &&
      state.reloadToken === generationToken &&
      getPendingPreviewClientReloadToken(chatId) === generationToken,
  );
}

function confirmPendingPreviewDocumentCandidate(
  chatId,
  sessionId,
  documentId,
  viewerId,
  generationToken,
) {
  if (
    !isPendingPreviewDocumentCandidate(
      chatId,
      sessionId,
      documentId,
      viewerId,
      generationToken,
    )
  ) {
    return false;
  }
  const state = pendingPreviewDocuments.get(documentId);
  state.viewerId = viewerId;
  maybeAcknowledgePreviewDocument(documentId, state);
  return true;
}

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
  changeOrigin: false,
});

// http-proxy registers the downstream socket before its upstream WS request
// has returned `101 Switching Protocols`. Keep that socket non-broadcastable
// until the upgrade event has completed; setImmediate runs after http-proxy's
// own upgrade listener writes the downstream 101 response.
proxy.on("proxyReqWs", (proxyReq, req, socket) => {
  const registration = req.__previewSocketRegistration;
  if (!registration) return;
  proxyReq.once("upgrade", () => {
    setImmediate(() => {
      if (markPreviewSocketHandshakeComplete(registration.chatId, socket)) {
        registration.confirmCandidate?.();
      }
    });
  });
});

/**
 * Next dev is started with SAJTMASKIN_PREVIEW_BASE_PATH=/{chatId}, so it expects
 * paths like /{chatId}/ and /{chatId}/_next/... — not stripped to / only.
 */
function rewriteRequestUrl(req, chatId, restPath, search) {
  const prefix = `/${encodeURIComponent(chatId)}`;
  const tail = !restPath || restPath === "/" ? "" : restPath;
  req.url = `${prefix}${tail}${search || ""}`;
}

function sendRuntimeStartingPage(res, session, options = {}) {
  // Returnerar `true` om sidan faktiskt skrevs, annars `false` så att
  // anroparen (proxy.on("error")) kan avsluta/förstöra svaret i stället för
  // att lämna iframen hängande när headers/body redan delvis skickats.
  if (!res || res.headersSent || res.writableEnded) return false;
  const recovering = options.recovering === true;
  const heading = recovering ? "Startar om preview" : "Startar preview";
  const intro = recovering
    ? "Preview-runtimen startar om i bakgrunden. Sidan laddar om automatiskt om några sekunder."
    : "Preview-host bygger projektet och startar Next.js i bakgrunden. Sidan laddar om automatiskt om några sekunder.";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
    <meta http-equiv="refresh" content="4" />
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b0b0d; color: #f5f5f5; display: grid; place-items: center; min-height: 100vh; }
      main { max-width: 40rem; padding: 2rem; text-align: center; }
      .muted { color: #a3a3a3; }
      code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 0.4rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p class="muted">${intro}</p>
      <p class="muted">Chat: <code>${getSessionChatId(session)}</code></p>
      <p class="muted">Status: <code>${session.status}</code></p>
    </main>
  </body>
</html>`);
  return true;
}

function sendHeldPreviewErrorPage(res, session) {
  if (!res || res.headersSent || res.writableEnded) return false;
  res.writeHead(503, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview kunde inte starta</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b0b0d; color: #f5f5f5; display: grid; place-items: center; min-height: 100vh; }
      main { max-width: 40rem; padding: 2rem; text-align: center; }
      .muted { color: #a3a3a3; }
      code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 0.4rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Preview kunde inte starta</h1>
      <p class="muted">Uppstarten misslyckades. Försök igen från byggaren.</p>
      <p class="muted">Chat: <code>${getSessionChatId(session)}</code></p>
      <p class="muted">Status: <code>error</code></p>
    </main>
  </body>
</html>`);
  return true;
}

function refuseHeldPreviewUpgrade(socket, failed) {
  if (!socket || socket.destroyed) return;
  const message = failed
    ? "Preview startup failed; retry from the builder."
    : "Preview is not public while prewarm or replacement is pending.";
  const body = Buffer.from(message, "utf8");
  try {
    socket.end(
      [
        "HTTP/1.1 503 Service Unavailable",
        "Connection: close",
        "Content-Type: text/plain; charset=utf-8",
        `Content-Length: ${body.length}`,
        "",
        message,
      ].join("\r\n"),
    );
  } catch {
    socket.destroy();
  }
}

// Proxy-fel som indikerar att runtimen är nere ELLER har blivit en zombie som
// resettar mitt i ett svar. `socket hang up`/`ECONNRESET` är just det fall som
// gav rå `{"error":"proxy_failed"}` i iframen + Fly PU02 — vi vill recycla
// runtimen och servera den vänliga vänte-/omstartssidan i stället.
function isRecoverableProxyError(err) {
  if (!err) return false;
  const code = typeof err.code === "string" ? err.code : "";
  if (["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "EPIPE", "ETIMEDOUT"].includes(code)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ECONNRESET|ECONNABORTED|EPIPE|ETIMEDOUT|socket hang up|connection closed|aborted/i.test(
    msg,
  );
}

/**
 * P26: even when SAJTMASKIN_PREVIEW_DISABLE_HMR=true silences webpack's
 * HMR plugin, Next 15's app-router Fast Refresh ships its OWN client
 * (`next/dist/client/dev/hot-reloader/app/web-socket.js`) that attempts
 * `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr` (or
 * `/_next/turbopack-hmr`). The client is bundled independently of
 * `HotModuleReplacementPlugin`, so removing that plugin does not silence
 * it. Previously we stubbed these paths with a 404 on upgrade, but the
 * browser's HMR client treats that as a connection failure and retries
 * every 2–5 seconds, spamming the console.
 *
 * Fix (2026-04-23): complete the WebSocket handshake (RFC 6455 101
 * Switching Protocols) ourselves and then hold the socket open as a
 * no-op — never send HMR events, silently drop any incoming frames.
 * Browser considers itself connected and stops retrying. Hot-reload
 * inside the preview VM is still disabled (Next's full reload on
 * every new generation via `refreshToken` takes care of that instead).
 *
 * We do the handshake inline rather than pulling in `ws` as a dep so
 * preview-host stays lean on Fly. Handshake = sha1(key + MAGIC) → base64.
 */
// Next 16.3 döpte om endpointen till `/_next/hmr`; 15.x och tidigare 16.x
// använde `/_next/webpack-hmr` respektive `/_next/turbopack-hmr`. Genererade
// sajter kan ligga kvar på en äldre Next, så alla tre måste matcha. Längsta
// alternativet först — alternering är icke-girig.
const HMR_PATH_RE = /\/_next\/(?:webpack-hmr|turbopack-hmr|hmr)(?:\/|$|\?)/;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function isHmrPath(pathname) {
  if (!pathname) return false;
  return HMR_PATH_RE.test(pathname);
}

function hmrSilencedForRequest() {
  // When the HMR proxy is enabled we must NOT silence/stub — let HMR paths flow
  // through the normal proxy to the runtime so Fast Refresh works end to end.
  if (isHmrProxyEnabled()) return false;
  return (process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR ?? "true") === "true";
}

/**
 * Complete a WebSocket upgrade handshake ourselves and hold the socket
 * open without sending any frames. Returns `true` on success, `false` if
 * the request didn't look like a valid WebSocket upgrade (caller should
 * fall back to whatever 404/destroy path it would normally take).
 */
function acceptAndHoldWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || key.length === 0) {
    return false;
  }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  try {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
    );
  } catch {
    return false;
  }
  try {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
  } catch {
    // Non-fatal — socket options are best-effort.
  }
  const drop = () => { /* silently discard any incoming data */ };
  socket.on("data", drop);
  socket.on("error", () => {
    try { socket.destroy(); } catch { /* already closed */ }
  });
  return true;
}

/**
 * Returnerar `<script>`-taggen att injicera om requesten är ett opt-in
 * inspektera-anrop (`?inspect=1`) och app-origin är satt; annars `null`.
 * Script-källan kommer från första posten i preview-hostens EGEN allowlist
 * (`SAJTMASKIN_APP_ORIGINS`), aldrig från query.
 */
function inspectInjectionScriptSrc(search) {
  if (!INSPECT_APP_ORIGIN) return null;
  let qs = String(search || "");
  if (qs.startsWith("?")) qs = qs.slice(1);
  let on = false;
  try { on = new URLSearchParams(qs).get(PREVIEW_INSPECT_QUERY_PARAM) === "1"; } catch { on = false; }
  if (!on) return null;
  return `${INSPECT_APP_ORIGIN}/api/inspect-bridge?parent=${encodeURIComponent(INSPECT_APP_ORIGIN)}`;
}

/**
 * `inspect`, `__sm_refresh` och `__sm_viewer` är preview-hostens egna
 * kontrakt, inte app-input.
 * Strippa parametrarna innan requesten proxas vidare så den genererade appens
 * `searchParams`/SSR aldrig ser dem.
 * Körs OAVSETT om injektion är möjlig (Codex P2, PR #351): även när
 * app-origin-allowlisten saknas (partiell rollout/felkonfig) får appen
 * aldrig se parametern. Fast-path: no-op när `inspect` inte finns i queryn.
 */
function stripPreviewHostParams(search) {
  let qs = String(search || "");
  if (!qs) return search;
  if (qs.startsWith("?")) qs = qs.slice(1);
  try {
    const params = new URLSearchParams(qs);
    if (!PREVIEW_HOST_QUERY_PARAMS.some((name) => params.has(name))) return search;
    for (const name of PREVIEW_HOST_QUERY_PARAMS) params.delete(name);
    const rest = params.toString();
    return rest ? `?${rest}` : "";
  } catch {
    return search;
  }
}

function normalizePreviewViewerId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PREVIEW_VIEWER_ID_RE.test(trimmed) ? trimmed : null;
}

function previewHmrIdentityFromSearch(search = "") {
  try {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const viewerId = params.get(PREVIEW_VIEWER_QUERY_PARAM) || "";
    const documentId = params.get("id") || "";
    if (
      !PREVIEW_VIEWER_ID_RE_MINTED.test(viewerId) ||
      !PREVIEW_DOCUMENT_ID_RE.test(documentId)
    ) {
      return null;
    }
    return { viewerId, documentId };
  } catch {
    return null;
  }
}

function previewViewerIdFromSearch(search = "") {
  try {
    const query = String(search || "").replace(/^\?/, "");
    return normalizePreviewViewerId(
      new URLSearchParams(query).get(PREVIEW_VIEWER_QUERY_PARAM),
    );
  } catch {
    return null;
  }
}

function previewViewerIdFromRequest(req, search = "") {
  try {
    const fromRequest = previewViewerIdFromSearch(search);
    if (fromRequest) return fromRequest;
  } catch {
    // Fall through to the document Referer.
  }
  const referer = req?.headers?.referer;
  if (typeof referer !== "string" || !referer) return null;
  try {
    return normalizePreviewViewerId(
      new URL(referer).searchParams.get(PREVIEW_VIEWER_QUERY_PARAM),
    );
  } catch {
    return null;
  }
}

function isPreviewDocumentNavigation(req, restPath = "/") {
  if (String(req?.method || "").toUpperCase() !== "GET") return false;
  const headers = req?.headers ?? {};
  if (
    headers.rsc !== undefined ||
    headers["next-action"] !== undefined ||
    headers["next-router-state-tree"] !== undefined ||
    headers["next-router-prefetch"] !== undefined ||
    headers["next-router-segment-prefetch"] !== undefined
  ) {
    return false;
  }
  if (
    isHmrPath(restPath) ||
    restPath.startsWith("/_next/") ||
    restPath.startsWith("/__nextjs") ||
    APP_API_ROOT_PATH_RE.test(restPath)
  ) {
    return false;
  }
  const mode = String(headers["sec-fetch-mode"] || "").toLowerCase();
  const destination = String(headers["sec-fetch-dest"] || "").toLowerCase();
  // Do not guess for legacy/missing Fetch Metadata: a false ACK can suppress
  // the only reload signal, while the pending generation already has a hard
  // expiry. Modern embedded previews provide both headers on navigation.
  return mode === "navigate" && (destination === "iframe" || destination === "document");
}

/**
 * Root-absolute paths emitted by code running inside a multiplexed preview.
 *
 * Next dev ignores basePath for some internal requests. Generated apps also
 * keep deploy-portable endpoint URLs such as `/api/chat`; browsers do not add
 * Next's basePath to `fetch()` or SDK transport URLs. Browser-initiated calls
 * can therefore use the page Referer to recover the owning chat and proxy the
 * request as `/<chatId><originalPath>`.
 *
 * Keep app routing deliberately narrow: normal page paths must still 404 when
 * they omit the chatId, while every generated App Router API route shares the
 * stable `/api/*` namespace.
 */
const NEXT_INTERNAL_ROOT_PATH_RE = /^\/(?:__nextjs_[^/]+|_next)(?:\/|$)/;
const APP_API_ROOT_PATH_RE = /^\/api(?:\/|$)/;

/** ChatId of the page the request came from (first path segment of Referer). */
function chatIdFromReferer(req) {
  const raw = req?.headers?.referer;
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const segments = new URL(raw).pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    return decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
}

/**
 * Resolve a session for supported root-absolute runtime requests by falling
 * back to the Referer's chatId. Returns `{ info: { chatId, restPath }, state }`
 * (restPath = the FULL original pathname, since upstream serves the asset
 * under the chatId basePath) or `null` when the fallback does not apply.
 * Returns the already-fetched runtime state so the caller avoids a second
 * synchronous store read on this hot path.
 */
function rootAbsoluteRefererFallback(req, pathname) {
  if (
    !NEXT_INTERNAL_ROOT_PATH_RE.test(pathname) &&
    !APP_API_ROOT_PATH_RE.test(pathname)
  ) {
    return null;
  }
  const refChatId = chatIdFromReferer(req);
  if (!refChatId) return null;
  const refState = getRuntimeStateForChat(refChatId);
  if (!refState.session) return null;
  return { info: { chatId: refChatId, restPath: pathname }, state: refState };
}

/**
 * The prewarm runtime is intentionally never public. While it is warming (or a
 * real replacement is pending), HTTP uses the host-owned start/error document
 * and every WS upgrade is refused. Ordinary non-prewarm booting is excluded.
 */
function shouldHoldPrewarmTraffic(state) {
  return Boolean(
    state?.session &&
      (state.session.prewarm === true || state.session.prewarmReplacementPending === true),
  );
}

function isFailedPrewarmTraffic(state) {
  return Boolean(
    shouldHoldPrewarmTraffic(state) && state.session.status === "error",
  );
}

function isFailedRuntimeTraffic(state) {
  return Boolean(
    state?.session &&
      state.session.status === "error" &&
      state.session.readinessState === "failed",
  );
}

function sendPreviewHostScript(res, bodySource) {
  const body = Buffer.from(bodySource, "utf8");
  res.writeHead(200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function rejectPreviewHostScriptMethod(res) {
  res.writeHead(405, {
    Allow: "GET",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Method Not Allowed");
}

function sanitizePreviewReferer(req) {
  const referer = req?.headers?.referer;
  if (typeof referer !== "string" || !referer) return;
  try {
    const url = new URL(referer);
    url.search = stripPreviewHostParams(url.search);
    req.headers.referer = url.toString();
  } catch {
    // An invalid Referer was already untrusted input; leave it unchanged.
  }
}

function previewRedirectLocation(location, viewerId, req, chatId, inspectEnabled = false) {
  const hasViewer = PREVIEW_VIEWER_ID_RE_MINTED.test(viewerId || "");
  if (!hasViewer && !inspectEnabled) return location;
  if (typeof location !== "string" || !location) return location;
  const candidate = location.trim();
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "http")
    .split(",")[0]
    .trim();
  const publicHost = String(req?.headers?.host || "").trim();
  if (!candidate || !publicHost || !chatId) return location;
  const publicOrigin = `${forwardedProto || "http"}://${publicHost}`;
  try {
    const currentUrl = new URL(req?.url || `/${encodeURIComponent(chatId)}/`, publicOrigin);
    const target = new URL(candidate, currentUrl);
    const firstSegment = target.pathname.split("/").filter(Boolean)[0] ?? "";
    // A viewer belongs to one multiplexed chat. Same-host redirects that jump
    // to another chat (including `../` escapes) must not carry that identity.
    if (target.origin !== publicOrigin || decodeURIComponent(firstSegment) !== chatId) {
      return location;
    }
    const hashAt = candidate.indexOf("#");
    const beforeHash = hashAt === -1 ? candidate : candidate.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : candidate.slice(hashAt);
    const queryAt = beforeHash.indexOf("?");
    const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
    const params = new URLSearchParams(query);
    if (hasViewer && !params.has(PREVIEW_VIEWER_QUERY_PARAM)) {
      params.set(PREVIEW_VIEWER_QUERY_PARAM, viewerId);
    }
    if (inspectEnabled) params.set(PREVIEW_INSPECT_QUERY_PARAM, "1");
    const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
    return `${path}?${params.toString()}${hash}`;
  } catch {
    return location;
  }
}

async function proxyPreviewRequest(req, res, pathname, search = "") {
  let info = routeInfoFromPathname(pathname);
  if (!info) return false;
  let state = getRuntimeStateForChat(info.chatId);
  if (!state.session) {
    // Root-absolute Next internals and browser-initiated `/api/*` calls arrive
    // WITHOUT the multiplexing prefix. Recover it from the iframe Referer.
    const fallback = rootAbsoluteRefererFallback(req, pathname);
    if (!fallback) return false;
    info = fallback.info;
    state = fallback.state;
  }
  if (!state.session) return false;

  // Host-owned scripts are deliberately scoped below a currently usable
  // preview session. A guessed `/unknown/__sm/*` URL is never a public script
  // endpoint and can neither mint nor acknowledge viewer state.
  if (info.restPath === PREVIEW_BOOTSTRAP_PATH) {
    if (String(req.method || "GET").toUpperCase() !== "GET") {
      rejectPreviewHostScriptMethod(res);
      return true;
    }
    sendPreviewHostScript(res, PREVIEW_BOOTSTRAP_SCRIPT);
    return true;
  }
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    res.writeHead(404, { "Content-Type": "text/plain", "Connection": "close" });
    res.end("HMR disabled in tunneled preview");
    return true;
  }

  // Fetch Metadata—not the presence of a copied query—proves that this is a
  // real browsing-context navigation. Every successful runtime HTML document
  // receives the bootstrap, including canonical/open-new-tab URLs with no
  // viewer query. Receipt alone is never an ACK.
  const previewDocumentNavigation = isPreviewDocumentNavigation(req, info.restPath);
  const initialViewerId = previewViewerIdFromSearch(search);
  if (shouldHoldPrewarmTraffic(state)) {
    if (isFailedPrewarmTraffic(state)) {
      sendHeldPreviewErrorPage(res, state.session);
      return true;
    }
    if (!state.booting) {
      queueRuntimeBoot(info.chatId, {
        restart: state.session.prewarmReplacementPending === true,
      });
    }
    const trackedForPrewarmActivity = runtimeChildren.get(state.session.sessionId);
    if (trackedForPrewarmActivity) trackedForPrewarmActivity.lastActivityAt = Date.now();
    sendRuntimeStartingPage(res, state.session);
    return true;
  }
  if (isFailedRuntimeTraffic(state)) {
    sendHeldPreviewErrorPage(res, state.session);
    return true;
  }
  if (state.running && state.runtimePort && state.acceptingTraffic) {
    const trackedForActivity = runtimeChildren.get(state.session.sessionId);
    if (trackedForActivity) trackedForActivity.lastActivityAt = Date.now();
    const inspectScriptSrc = inspectInjectionScriptSrc(search);
    const documentId = previewDocumentNavigation
      ? createPendingPreviewDocument(info.chatId, state.session.sessionId)
      : null;
    if (documentId) {
      // Next 16 emits requestId (not htmlRequestId) as `self.__next_r`, then
      // includes it in every App Router HMR WebSocket URL. Seed BOTH fields
      // with this exact document id. The host bootstrap leaves `self.__next_r`
      // untouched and carries its stable per-tab viewer in a separate reserved
      // HMR query parameter, which is stripped before Next receives it.
      req.headers[NEXT_REQUEST_ID_HEADER] = documentId;
      req.headers[NEXT_HTML_REQUEST_ID_HEADER] = documentId;
      req.__previewDocument = {
        chatId: info.chatId,
        sessionId: state.session.sessionId,
        documentId,
        bootstrapScriptSrc: `/${encodeURIComponent(info.chatId)}${PREVIEW_BOOTSTRAP_PATH}`,
        chatPath: `/${encodeURIComponent(info.chatId)}`,
        storageKey: `sajtmaskin:preview-viewer:${info.chatId}`,
        previewSessionId: state.session.previewSessionId,
        versionId: state.session.versionId,
        appOrigins: APP_ORIGINS.join(","),
        inspectEnabled: Boolean(inspectScriptSrc),
        initialViewerId: PREVIEW_VIEWER_ID_RE_MINTED.test(initialViewerId || "")
          ? initialViewerId
          : null,
        responseStarted: false,
        cancelled: false,
      };
      armPreviewDocumentPreResponseCleanup(req, res, req.__previewDocument);
    }
    // C: den genererade appen får aldrig se `?inspect=1` — parametern
    // konsumeras här (injektionsbeslutet) och strippas ALLTID från
    // upstream-URL:en, även när injektion inte är möjlig (Codex P2).
    rewriteRequestUrl(req, info.chatId, info.restPath, stripPreviewHostParams(search));
    sanitizePreviewReferer(req);
    // Spegla WS-pathens Origin-strip (proxyPreviewUpgrade, se kommentar där):
    // Next 16:s `blockCrossSiteDEV` 403:ar även HTTP-requests till interna
    // Next-paths (`/_next/*`, `/__nextjs*`) vars `Origin` (Fly-hosten) inte
    // matchar dev-serverns host (127.0.0.1) eller `allowedDevOrigins`. Syns bl.a.
    // som 403 på dev-overlayns `/__nextjs_font/geist-latin.woff2` (root-absolut
    // via Referer-fallbacken). Origin-lösa requests tillåts av Next, så vi
    // strippar headern för interna paths. App-egna endpoints lämnas orörda.
    if (
      isHmrPath(info.restPath) ||
      info.restPath.startsWith("/_next/") ||
      info.restPath.startsWith("/__nextjs")
    ) {
      delete req.headers.origin;
    }
    if (inspectScriptSrc || documentId) {
      // Buffer/stream the response ourselves: viewer bootstrap is first in
      // <head>; inspector remains last in <body>.
      req.__inspectScriptSrc = inspectScriptSrc;
      // Be uppströms-runtimen om OKOMPRIMERAD HTML — annars kan svaret komma
      // gzip:at (content-encoding) och proxyRes-handlern hoppar då injektionen
      // (icke-injicerbart), så inspektorn blir inert trots ?inspect=1.
      req.headers["accept-encoding"] = "identity";
      proxy.web(req, res, {
        target: `http://${LOOPBACK}:${state.runtimePort}`,
        selfHandleResponse: true,
      });
    } else {
      proxy.web(req, res, { target: `http://${LOOPBACK}:${state.runtimePort}` });
    }
    return true;
  }
  const trackedForStartingActivity = runtimeChildren.get(state.session.sessionId);
  if (trackedForStartingActivity) trackedForStartingActivity.lastActivityAt = Date.now();
  queueRuntimeBoot(info.chatId);
  sendRuntimeStartingPage(res, state.session);
  return true;
}

async function proxyPreviewUpgrade(req, socket, head, pathname, search = "") {
  let info = routeInfoFromPathname(pathname);
  if (!info) return false;
  // Mirror the HTTP fallback for root-absolute runtime WS upgrades.
  let state = getRuntimeStateForChat(info.chatId);
  if (!state.session) {
    const fallback = rootAbsoluteRefererFallback(req, pathname);
    if (fallback) {
      info = fallback.info;
      state = fallback.state;
    }
  }
  const hmrIdentity = isHmrPath(info.restPath)
    ? previewHmrIdentityFromSearch(search)
    : null;
  const previewViewerId = previewViewerIdFromRequest(req, search, {
    allowHmrRequestId: isHmrPath(info.restPath),
  });
  if (state.session && shouldHoldPrewarmTraffic(state)) {
    const failed = isFailedPrewarmTraffic(state);
    if (!failed && !state.booting) {
      queueRuntimeBoot(info.chatId, {
        restart: state.session.prewarmReplacementPending === true,
      });
    }
    refuseHeldPreviewUpgrade(socket, failed);
    return true;
  }
  if (isFailedRuntimeTraffic(state)) {
    refuseHeldPreviewUpgrade(socket, true);
    return true;
  }
  let candidateGenerationToken = null;
  let candidateDocumentId = null;
  const candidateSessionId = state.session?.sessionId ?? null;
  if (
    state.running &&
    state.acceptingTraffic &&
    state.session &&
    hmrIdentity
  ) {
    candidateGenerationToken = classifyPendingPreviewDocumentCandidate(
      info.chatId,
      candidateSessionId,
      hmrIdentity.documentId,
      hmrIdentity.viewerId,
    );
    if (candidateGenerationToken) candidateDocumentId = hmrIdentity.documentId;
  }
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    // Complete the handshake and hold the socket open silently. Browser
    // sees a "connected" WebSocket and stops retry-spamming the console.
    // See `acceptAndHoldWebSocket` JSDoc for the full rationale (replaces
    // the earlier 404-stub which triggered the HMR client's retry loop).
    if (acceptAndHoldWebSocket(req, socket)) {
      if (candidateGenerationToken && candidateDocumentId) {
        confirmPendingPreviewDocumentCandidate(
          info.chatId,
          candidateSessionId,
          candidateDocumentId,
          hmrIdentity.viewerId,
          candidateGenerationToken,
        );
      }
      const candidateStillPending = Boolean(
        candidateGenerationToken &&
          candidateDocumentId &&
          isPendingPreviewDocumentCandidate(
            info.chatId,
            candidateSessionId,
            candidateDocumentId,
            hmrIdentity.viewerId,
            candidateGenerationToken,
          ),
      );
      // Även en host-hållen stub-socket betyder "en iframe är öppen" — räkna
      // den så idle-reapern inte stoppar en runtime någon tittar på.
      registerPreviewSocket(info.chatId, socket, {
        handshakeComplete: true,
        viewerId: previewViewerId,
        candidateGenerationToken: candidateStillPending
          ? candidateGenerationToken
          : null,
        candidateDocumentId: candidateStillPending ? candidateDocumentId : null,
      });
      return true;
    }
    // Malformed upgrade request (no Sec-WebSocket-Key); close the socket.
    try { socket.destroy(); } catch { /* already closed */ }
    return true;
  }
  // (B) HMR-WS under (re)boot: när HMR-proxyn är på men runtimen inte kör skulle
  // ett `proxy.ws` mot en ej-lyssnande port ge ECONNREFUSED → destroy →
  // klientens HMR-reconnect-storm (syns som Fly `[PU02] connection closed`-spam
  // under hela reboot-fönstret). Vänta i stället en boot (om ingen redan pågår)
  // och håll socketen tyst tills runtimen är uppe. Ett runtime-byte under en
  // öppen iframe (SM-044) skickar reloadPage på dessa sockets så klienten inte
  // hydrerar gammal JS mot den nya processens HTML; refreshToken täcker nya
  // generationer som buildern redan känner till.
  if (isHmrProxyEnabled() && isHmrPath(info.restPath)) {
    // Unknown session: there is no preview session for this chatId, so there is
    // nothing to boot or hold open for. Close the socket instead of holding a
    // stale HMR connection (and instead of queueing a no-op boot for a session
    // that does not exist). Without this guard the `!state.running` branch below
    // would `acceptAndHoldWebSocket` an orphan socket indefinitely.
    if (!state.session) {
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
    if (!state.running) {
      if (!state.booting) queueRuntimeBoot(info.chatId);
      if (acceptAndHoldWebSocket(req, socket)) {
        registerPreviewSocket(info.chatId, socket, {
          handshakeComplete: true,
          viewerId: previewViewerId,
        });
        return true;
      }
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
    // SM-044: the replacement runtime may already be listening, but the iframe
    // still has the previous document. Proxying this upgrade would complete
    // Next's handshake without ever sending reloadPage. Stub, signal, and let
    // the reloaded page connect to live HMR on the next upgrade.
    if (
      hasPendingPreviewClientReload(info.chatId, previewViewerId) &&
      !candidateGenerationToken
    ) {
      if (acceptAndHoldWebSocket(req, socket)) {
        registerPreviewSocket(info.chatId, socket, {
          handshakeComplete: true,
          viewerId: previewViewerId,
        });
        return true;
      }
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
  }
  const runtime = await ensureRuntimeForChat(info.chatId);
  if (!runtime) return false;
  const live = getRuntimeStateForChat(info.chatId);
  const candidateStillPending = Boolean(
    candidateGenerationToken &&
      candidateDocumentId &&
      hmrIdentity &&
      live.session?.sessionId === candidateSessionId &&
      isPendingPreviewDocumentCandidate(
        info.chatId,
        candidateSessionId,
        candidateDocumentId,
        hmrIdentity.viewerId,
        candidateGenerationToken,
      ),
  );
  if (candidateDocumentId && !candidateStillPending) {
    candidateGenerationToken = null;
    candidateDocumentId = null;
  }
  if (!live.acceptingTraffic) {
    if (acceptAndHoldWebSocket(req, socket)) {
      registerPreviewSocket(info.chatId, socket, {
        handshakeComplete: true,
        viewerId: previewViewerId,
      });
      return true;
    }
    try { socket.destroy(); } catch { /* already closed */ }
    return true;
  }
  if (
    isHmrPath(info.restPath) &&
    hasPendingPreviewClientReload(info.chatId, previewViewerId) &&
    !candidateGenerationToken
  ) {
    if (acceptAndHoldWebSocket(req, socket)) {
      registerPreviewSocket(info.chatId, socket, {
        handshakeComplete: true,
        viewerId: previewViewerId,
      });
      return true;
    }
    try { socket.destroy(); } catch { /* already closed */ }
    return true;
  }
  const trackedForActivity = runtimeChildren.get(runtime.session.sessionId);
  if (trackedForActivity) trackedForActivity.lastActivityAt = Date.now();
  registerPreviewSocket(info.chatId, socket, {
    viewerId: previewViewerId,
    candidateGenerationToken,
    candidateDocumentId,
  });
  let candidateHandshakeConfirmed = false;
  if (candidateDocumentId) {
    socket.once("close", () => {
      if (!candidateHandshakeConfirmed) {
        discardPendingPreviewDocument(candidateDocumentId, {
          releaseCandidate: true,
        });
      }
    });
    req.__previewDocumentCandidate = { documentId: candidateDocumentId };
  }
  req.__previewSocketRegistration = {
    chatId: info.chatId,
    confirmCandidate:
      candidateGenerationToken && candidateDocumentId && hmrIdentity
        ? () => {
            candidateHandshakeConfirmed = confirmPendingPreviewDocumentCandidate(
              info.chatId,
              candidateSessionId,
              candidateDocumentId,
              hmrIdentity.viewerId,
              candidateGenerationToken,
            );
          }
        : null,
  };
  rewriteRequestUrl(
    req,
    info.chatId,
    info.restPath,
    stripPreviewHostParams(search),
  );
  sanitizePreviewReferer(req);
  // Next 16 dev (`blockCrossSiteDEV`) avvisar WS-upgrades till interna paths
  // (`/_next/*`, `/__nextjs*`) vars `Origin` inte matchar dev-serverns hostname
  // (här 127.0.0.1) eller `allowedDevOrigins`. Browserns HMR-socket skickar
  // `Origin: https://<fly-host>` → 403 → syns som 502 via Fly-edgen. Värre:
  // Next 16.2 levererar Reacts debugkanal (REACT_DEBUG_CHUNK) över samma
  // socket och HYDRERINGEN väntar på den — utan ansluten HMR-WS förblir
  // previewn död SSR-HTML (inga klick funkar). Origin-lösa upgrades släpps
  // igenom av Next ("Allow requests with no origin"), så vi strippar headern
  // för interna Next-paths. App-egna WS-endpoints lämnas orörda.
  if (isHmrPath(info.restPath) || info.restPath.startsWith("/_next/") || info.restPath.startsWith("/__nextjs")) {
    delete req.headers.origin;
  }
  proxy.ws(req, socket, head, { target: `ws://${LOOPBACK}:${runtime.runtimePort}` });
  return true;
}

function injectPreviewHeadTag(body, tag) {
  if (!tag) return body;
  const headMatch = /<head(?:\s[^>]*)?>/i.exec(body);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return body.slice(0, insertAt) + tag + body.slice(insertAt);
  }
  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(body);
  if (htmlMatch?.index !== undefined) {
    const insertAt = htmlMatch.index + htmlMatch[0].length;
    return body.slice(0, insertAt) + tag + body.slice(insertAt);
  }
  return tag + body;
}

function previewHeadTagInsertionOffset(markup) {
  const headMatch = /<head(?:\s[^>]*)?>/i.exec(markup);
  if (headMatch?.index !== undefined) {
    return headMatch.index + headMatch[0].length;
  }
  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(markup);
  if (htmlMatch?.index !== undefined) {
    return htmlMatch.index + htmlMatch[0].length;
  }
  return null;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function effectiveResponseScriptSources(headers) {
  const csp = String(headers?.["content-security-policy"] || "");
  if (!csp) return null;
  const directives = new Map();
  for (const rawDirective of csp.split(";")) {
    const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    // CSP uses the first occurrence of a directive and ignores later duplicates.
    if (!directives.has(name)) directives.set(name, tokens.slice(1));
  }
  return (
    directives.get("script-src-elem") ??
    directives.get("script-src") ??
    directives.get("default-src") ??
    null
  );
}

function responseScriptNonce(headers, html = "") {
  const sources = effectiveResponseScriptSources(headers);
  if (sources) {
    for (const source of sources) {
      const nonce = /^'nonce-([^']+)'$/i.exec(source)?.[1] ?? null;
      if (nonce) return nonce;
    }
    return null;
  }
  // Report-Only does not authorize execution and must never supply the nonce.
  return /<script\b[^>]*\bnonce\s*=\s*(["'])(.*?)\1/i.exec(html)?.[2] ?? null;
}

function responseAllowsPreviewBootstrap(headers) {
  const sources = effectiveResponseScriptSources(headers);
  if (!sources) return true;
  if (sources.some((source) => /^'nonce-[^']+'$/i.test(source))) return true;
  return sources.some((source) => source.toLowerCase() === "'self'");
}

function previewBootstrapTag(documentState, html, headers = {}) {
  if (!documentState?.bootstrapScriptSrc) return null;
  // A parser-blocking same-origin script works with `script-src 'self'`.
  // Nonce/strict-dynamic policies need the response's own nonce, so inherit it
  // without weakening or rewriting the app's CSP. Hash-only/none policies fail
  // closed: the unmodified document streams but cannot ACK this generation.
  if (!responseAllowsPreviewBootstrap(headers)) return null;
  const nonce = responseScriptNonce(headers, html);
  const nonceAttribute = nonce ? ` nonce="${escapeHtmlAttribute(nonce)}"` : "";
  return `<script data-sajtmaskin-preview-bootstrap data-document-id="${escapeHtmlAttribute(documentState.documentId)}" data-storage-key="${escapeHtmlAttribute(documentState.storageKey)}" data-chat-path="${escapeHtmlAttribute(documentState.chatPath)}" data-preview-session-id="${escapeHtmlAttribute(documentState.previewSessionId || "")}" data-version-id="${escapeHtmlAttribute(documentState.versionId || "")}" data-app-origins="${escapeHtmlAttribute(documentState.appOrigins || "")}" src="${escapeHtmlAttribute(documentState.bootstrapScriptSrc)}"${nonceAttribute}></script>`;
}

function previewInspectorTag(scriptSrc, headers, html = "") {
  if (!scriptSrc) return null;
  const nonce = responseScriptNonce(headers, html);
  const nonceAttribute = nonce ? ` nonce="${escapeHtmlAttribute(nonce)}"` : "";
  return `<script src="${escapeHtmlAttribute(scriptSrc)}" defer${nonceAttribute}></script>`;
}

function prepareInjectedResponseHeaders(headers) {
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  delete headers["content-md5"];
  delete headers.etag;
  headers["cache-control"] = "no-store";
}

// Host-owned HTML injection: normal documents buffer only a bounded head
// prefix, splice the bootstrap into the original bytes, then stream the shell
// immediately. The browser keeps Next's exact `self.__next_r`; its HMR socket
// carries the stable viewer separately. The nonce-bearing inspector is a
// deferred head script, so opt-in previews preserve the same shell streaming.
proxy.on("proxyRes", (proxyRes, req, res) => {
  const inspectScriptSrc = req.__inspectScriptSrc;
  const documentState = req.__previewDocument;
  if (!inspectScriptSrc && !documentState) return; // selfHandleResponse off
  if (documentState) {
    documentState.responseStarted = true;
    if (documentState.cancelled || res.destroyed) {
      documentState.cancelled = true;
      discardPendingPreviewDocument(documentState.documentId, {
        releaseCandidate: true,
      });
      if (!proxyRes.destroyed) proxyRes.destroy();
      return;
    }
  }

  const status = proxyRes.statusCode || 502;
  const headers = Object.assign({}, proxyRes.headers);
  const ct = String(headers["content-type"] || "").toLowerCase();
  const enc = String(headers["content-encoding"] || "").toLowerCase();
  const injectable =
    status >= 200 &&
    status < 300 &&
    status !== 204 &&
    status !== 205 &&
    ct.includes("text/html") &&
    (!enc || enc === "identity");

  if (!injectable) {
    if (documentState) {
      if (status >= 300 && status < 400 && headers.location) {
        // The first embedded request may redirect before bootstrap had a chance
        // to persist its explicit viewer. Carry it only over a same-origin or
        // relative redirect; never leak the host id to an external Location.
        headers.location = previewRedirectLocation(
          headers.location,
          documentState.initialViewerId,
          req,
          documentState.chatId,
          documentState.inspectEnabled,
        );
      }
      discardPendingPreviewDocument(documentState.documentId, {
        releaseCandidate: true,
      });
    }
    // Non-HTML, compressed, redirect, 204 or failure: no bootstrap and no ACK.
    if (!res.headersSent) res.writeHead(status, headers);
    const abort = () => {
      if (!res.destroyed && typeof res.destroy === "function") res.destroy();
    };
    res.once("close", () => {
      if (!res.writableFinished && !proxyRes.destroyed) proxyRes.destroy();
    });
    proxyRes.once("aborted", abort);
    proxyRes.once("error", abort);
    proxyRes.pipe(res);
    return;
  }

  let chunks = [];
  let total = 0;
  let mode = "scan-head";
  let failed = false;
  let bootstrapInjected = false;
  let documentReleased = false;
  let upstreamEnded = false;
  let waitingForDrain = false;
  const outputQueue = [];

  const discardDocument = (releaseCandidate = true) => {
    if (documentState && !documentReleased) {
      documentReleased = true;
      discardPendingPreviewDocument(documentState.documentId, {
        releaseCandidate,
      });
    }
  };
  const failStream = () => {
    if (failed || res.writableFinished) return;
    failed = true;
    discardDocument(true);
    // Once any part of a 200 response reached the browser, ending cleanly
    // would present truncated HTML as success. Abort the downstream instead.
    if (res.headersSent) {
      if (!res.destroyed && typeof res.destroy === "function") res.destroy();
      return;
    }
    try {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("Preview runtime response aborted.");
    } catch {
      if (!res.destroyed && typeof res.destroy === "function") res.destroy();
    }
  };

  proxyRes.once("aborted", failStream);
  proxyRes.once("error", failStream);
  res.once("finish", () => {
    if (failed || !bootstrapInjected || !documentState) return;
    markPreviewDocumentDownstreamFinished(documentState.documentId);
  });
  res.once("close", () => {
    if (!res.writableFinished && !failed) {
      failed = true;
      discardDocument(true);
      if (!proxyRes.destroyed) proxyRes.destroy();
    }
  });

  const finishDownstreamIfReady = () => {
    if (
      upstreamEnded &&
      !failed &&
      !waitingForDrain &&
      outputQueue.length === 0 &&
      !res.writableEnded
    ) {
      res.end();
    }
  };

  const flushOutputQueue = () => {
    if (failed || waitingForDrain) return;
    while (outputQueue.length > 0) {
      const chunk = outputQueue.shift();
      if (res.write(chunk)) continue;
      waitingForDrain = true;
      proxyRes.pause();
      res.once("drain", () => {
        waitingForDrain = false;
        flushOutputQueue();
        if (!failed && !proxyRes.destroyed && !upstreamEnded) proxyRes.resume();
      });
      return;
    }
    finishDownstreamIfReady();
  };

  const writeResponseChunk = (chunk) => {
    if (!chunk || chunk.length === 0) return;
    outputQueue.push(chunk);
    flushOutputQueue();
  };

  const beginPassthrough = (prefix, remainder = null) => {
    mode = "passthrough";
    discardDocument(true);
    if (!res.headersSent) res.writeHead(status, headers);
    writeResponseChunk(prefix);
    writeResponseChunk(remainder);
    chunks = [];
  };

  const beginHeadStream = (prefix, remainder = null) => {
    const probe = prefix.toString("latin1");
    const bootstrapTag = previewBootstrapTag(documentState, probe, headers);
    const inspectorTag = previewInspectorTag(inspectScriptSrc, headers, probe);
    const headTag = `${bootstrapTag || ""}${inspectorTag || ""}`;
    const insertAt = previewHeadTagInsertionOffset(probe);
    if (!headTag || insertAt === null) {
      beginPassthrough(prefix, remainder);
      return false;
    }
    mode = "streaming";
    bootstrapInjected = Boolean(bootstrapTag);
    if (documentState && !bootstrapInjected) discardDocument(true);
    const out = Buffer.concat([
      prefix.subarray(0, insertAt),
      Buffer.from(headTag, "utf8"),
      prefix.subarray(insertAt),
    ]);
    prepareInjectedResponseHeaders(headers);
    if (!res.headersSent) res.writeHead(status, headers);
    writeResponseChunk(out);
    writeResponseChunk(remainder);
    chunks = [];
    return true;
  };

  proxyRes.on("data", (chunk) => {
    if (failed) return;
    if (mode === "streaming" || mode === "passthrough") {
      writeResponseChunk(chunk);
      return;
    }

    const remaining = Math.max(0, PREVIEW_HEAD_SCAN_MAX_BYTES - total);
    const scanned = remaining > 0 ? chunk.subarray(0, remaining) : Buffer.alloc(0);
    const remainder = chunk.subarray(scanned.length);
    if (scanned.length > 0) {
      chunks.push(scanned);
      total += scanned.length;
    }
    const prefix = Buffer.concat(chunks, total);

    if (previewHeadTagInsertionOffset(prefix.toString("latin1")) !== null) {
      beginHeadStream(prefix, remainder);
    } else if (total >= PREVIEW_HEAD_SCAN_MAX_BYTES) {
      beginPassthrough(prefix, remainder);
    }
  });
  proxyRes.on("end", () => {
    if (failed) return;
    upstreamEnded = true;
    if (mode === "streaming" || mode === "passthrough") {
      finishDownstreamIfReady();
      return;
    }

    const body = Buffer.concat(chunks, total);
    beginHeadStream(body);
    finishDownstreamIfReady();
  });
});

proxy.on("error", (err, req, res) => {
  const isHttpResponse = res && typeof res.writeHead === "function";
  if (req?.__previewDocument?.documentId) {
    discardPendingPreviewDocument(req.__previewDocument.documentId, {
      releaseCandidate: true,
    });
  }
  if (req?.__previewDocumentCandidate?.documentId) {
    discardPendingPreviewDocument(req.__previewDocumentCandidate.documentId, {
      releaseCandidate: true,
    });
  }

  // (C+E) Tidigare återhämtades bara `ECONNREFUSED`. En zombie-runtime som
  // accepterar anslutningar men resettar mitt i svaret (`socket hang up` /
  // ECONNRESET) gav i stället rå `{"error":"proxy_failed"}`-JSON i iframen +
  // Fly PU02. Nu behandlas alla recoverable transportfel lika: recycla runtimen
  // (utan restart-storm) och servera den vänliga auto-reloadande sidan.
  if (isRecoverableProxyError(err) && isHttpResponse) {
    const rawUrl = req?.url || "/";
    const pathname = String(rawUrl).split("?")[0] || "/";
    const info = routeInfoFromPathname(pathname);
    if (info) {
      const session = findSessionByChatId(readStoreSync(), info.chatId);
      if (session) {
        const state = getRuntimeStateForChat(info.chatId);
        if (isFailedRuntimeTraffic(state)) {
          const wrote = sendHeldPreviewErrorPage(res, state.session);
          if (!wrote && !res.writableEnded) {
            if (typeof res.destroy === "function") res.destroy();
            else res.end();
          }
          return;
        }
        // Köa EN restart-boot (dedupad mot pågående boot via `!state.booting`).
        // `restart: true` täcker båda fallen den tidigare split-logiken missade:
        //  - en levande-men-resettande zombie: `bootRuntimeForSession` stoppar
        //    den själv först. Vi gör INTE längre manuell stop-then-queue, som
        //    öppnade ett glapp där sessionen varken var running eller booting
        //    och 4s-refreshen kunde köa en konkurrerande plain boot;
        //  - ett redan dött barn (ECONNREFUSED): `restart: true` kringgår
        //    "stopped recently"-cooldownen som annars markerar sessionen `error`
        //    medan iframen säger att den startar om.
        if (!state.booting) {
          queueRuntimeBoot(info.chatId, { restart: true });
        }
        // Om reset:en skedde EFTER att upstream redan skickat headers/del av
        // body kan vi varken skriva omstartssidan eller JSON-fallbacken nedan.
        // Avsluta/förstör då svaret så iframen inte hänger på just det
        // mid-response-reset-fall den här vägen ska återhämta.
        const wrote = sendRuntimeStartingPage(res, session, { recovering: true });
        if (!wrote && !res.writableEnded) {
          if (typeof res.destroy === "function") res.destroy();
          else res.end();
        }
        return;
      }
    }
  }

  if (!isHttpResponse) {
    // WebSocket upgrade errors pass a Socket, not an HTTP response — just destroy it.
    if (res && typeof res.destroy === "function") res.destroy();
    return;
  }

  if (!res.headersSent) {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
  }
  if (!res.writableEnded) {
    res.end(
      JSON.stringify({
        error: "proxy_failed",
        message: err instanceof Error ? err.message : "Runtime proxy failed.",
      }),
    );
  }
});

module.exports = {
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  chatIdFromReferer,
  previewViewerIdFromRequest,
  previewViewerIdFromSearch,
  previewHmrIdentityFromSearch,
  isPreviewDocumentNavigation,
  injectPreviewHeadTag,
  stripPreviewHostParams,
  PREVIEW_VIEWER_QUERY_PARAM,
  PREVIEW_HMR_PATH_SUFFIXES,
  isHmrPath,
  APP_API_ROOT_PATH_RE,
  NEXT_INTERNAL_ROOT_PATH_RE,
  shouldHoldPrewarmTraffic,
  pendingPreviewDocumentCount,
};
