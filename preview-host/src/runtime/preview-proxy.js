"use strict";

// Preview-proxy/inspect: HTTP-/WS-proxning till dev-runtimen, HMR-stub/-proxy,
// prewarm-hold-sidor och inspector-bridge-injektion. Ren extraktion ur
// runtime.js — ingen beteendeändring.

const { createHash } = require("node:crypto");
const httpProxy = require("http-proxy");

const { readStoreSync } = require("./../store.js");
const {
  LOOPBACK,
  findSessionByChatId,
  getSessionChatId,
  isHmrProxyEnabled,
  registerPreviewSocket,
  routeInfoFromPathname,
  runtimeChildren,
} = require("./shared.js");
const {
  ensureRuntimeForChat,
  getRuntimeStateForChat,
  queueRuntimeBoot,
} = require("./process-lifecycle.js");

// Inspector-bridge (opt-in): injicera bridge-scriptet i HTML-svar BARA när
// klienten ber om det via `?inspect=1` OCH app-origin är konfigurerad. App-origin
// tas medvetet från EGEN env (inte query) för att undvika injektionshål. Utan
// env är injektionen helt inert → ingen beteendeförändring för dagens previews.
const INSPECT_APP_ORIGIN = (process.env.SAJTMASKIN_APP_ORIGIN || "").trim().replace(/\/+$/, "");
const INSPECT_BRIDGE_MAX_HTML_BYTES = 5 * 1024 * 1024;

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
  changeOrigin: false,
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
const HMR_PATH_RE = /\/_next\/(?:webpack|turbopack)-hmr(?:\/|$|\?)/;
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
 * Script-källan kommer från preview-hostens EGEN env (`SAJTMASKIN_APP_ORIGIN`),
 * aldrig från query — så ingen kan be oss injicera en godtycklig origin.
 */
function inspectInjectionTag(search) {
  if (!INSPECT_APP_ORIGIN) return null;
  let qs = String(search || "");
  if (qs.startsWith("?")) qs = qs.slice(1);
  let on = false;
  try { on = new URLSearchParams(qs).get("inspect") === "1"; } catch { on = false; }
  if (!on) return null;
  return `<script src="${INSPECT_APP_ORIGIN}/api/inspect-bridge?parent=${encodeURIComponent(INSPECT_APP_ORIGIN)}"><\/script>`;
}

/**
 * Inspect-kluster C (#164/#197): `?inspect=1` är preview-hostens injektions-
 * kontrakt, inte app-input. Strippa parametern innan requesten proxas vidare
 * så den genererade appens `searchParams`/SSR aldrig ser den (en app som
 * läser query-params kan annars ändra beteende/render i inspektionsläge).
 * Körs OAVSETT om injektion är möjlig (Codex P2, PR #351): även när
 * `SAJTMASKIN_APP_ORIGIN` saknas (partiell rollout/felkonfig) får appen
 * aldrig se parametern. Fast-path: no-op när `inspect` inte finns i queryn.
 */
function stripInspectParam(search) {
  let qs = String(search || "");
  if (!qs || qs.indexOf("inspect") === -1) return search;
  if (qs.startsWith("?")) qs = qs.slice(1);
  try {
    const params = new URLSearchParams(qs);
    if (!params.has("inspect")) return search;
    params.delete("inspect");
    const rest = params.toString();
    return rest ? `?${rest}` : "";
  } catch {
    return search;
  }
}

/**
 * Next-internal endpoints that dev-mode serves on ROOT-ABSOLUTE paths,
 * ignoring basePath. Concrete repro (TODO #4): the Next DevTools/dev-overlay
 * requests its own font at `/__nextjs_font/geist-latin.woff2` — no chatId
 * prefix — so `routeInfoFromPathname` reads `__nextjs_font` as a chatId,
 * finds no session and the request falls through to the generic JSON 404.
 * The asset itself is served fine at `/<chatId>/__nextjs_font/...`.
 */
const NEXT_INTERNAL_ROOT_PATH_RE = /^\/(?:__nextjs_[^/]+|_next)(?:\/|$)/;

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
 * Resolve a session for root-absolute Next-internal requests by falling back
 * to the Referer's chatId. Returns `{ info: { chatId, restPath }, state }`
 * (restPath = the FULL original pathname, since upstream serves the asset
 * under the chatId basePath) or `null` when the fallback does not apply.
 * Returns the already-fetched runtime state so the caller avoids a second
 * synchronous store read on this hot path.
 */
function nextInternalRefererFallback(req, pathname) {
  if (!NEXT_INTERNAL_ROOT_PATH_RE.test(pathname)) return null;
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

async function proxyPreviewRequest(req, res, pathname, search = "") {
  let info = routeInfoFromPathname(pathname);
  if (!info) return false;
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    res.writeHead(404, { "Content-Type": "text/plain", "Connection": "close" });
    res.end("HMR disabled in tunneled preview");
    return true;
  }
  let state = getRuntimeStateForChat(info.chatId);
  if (!state.session) {
    // TODO(#4) mitigation: dev-overlay/devtools assets arrive WITHOUT the
    // chatId prefix. Recover the session from the Referer header so the
    // request proxies to `/<chatId><originalPath>` instead of JSON-404:ing.
    const fallback = nextInternalRefererFallback(req, pathname);
    if (!fallback) return false;
    info = fallback.info;
    state = fallback.state;
  }
  if (!state.session) return false;
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
    sendRuntimeStartingPage(res, state.session);
    return true;
  }
  if (isFailedRuntimeTraffic(state)) {
    sendHeldPreviewErrorPage(res, state.session);
    return true;
  }
  if (state.running && state.runtimePort) {
    const trackedForActivity = runtimeChildren.get(state.session.sessionId);
    if (trackedForActivity) trackedForActivity.lastActivityAt = Date.now();
    const inspectTag = inspectInjectionTag(search);
    // C: den genererade appen får aldrig se `?inspect=1` — parametern
    // konsumeras här (injektionsbeslutet) och strippas ALLTID från
    // upstream-URL:en, även när injektion inte är möjlig (Codex P2).
    rewriteRequestUrl(req, info.chatId, info.restPath, stripInspectParam(search));
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
    if (inspectTag) {
      // Buffra svaret själva (proxyRes-handlern injicerar scriptet före </body>).
      req.__inspectInjectTag = inspectTag;
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
  queueRuntimeBoot(info.chatId);
  sendRuntimeStartingPage(res, state.session);
  return true;
}

async function proxyPreviewUpgrade(req, socket, head, pathname, search = "") {
  let info = routeInfoFromPathname(pathname);
  if (!info) return false;
  // Mirror the HTTP path's TODO(#4) mitigation: a root-absolute Next-internal
  // WS upgrade (no chatId prefix) would otherwise parse `_next`/`__nextjs_*`
  // as the chatId and be dropped for the missing session.
  let state = getRuntimeStateForChat(info.chatId);
  if (!state.session) {
    const fallback = nextInternalRefererFallback(req, pathname);
    if (fallback) {
      info = fallback.info;
      state = fallback.state;
    }
  }
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
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    // Complete the handshake and hold the socket open silently. Browser
    // sees a "connected" WebSocket and stops retry-spamming the console.
    // See `acceptAndHoldWebSocket` JSDoc for the full rationale (replaces
    // the earlier 404-stub which triggered the HMR client's retry loop).
    if (acceptAndHoldWebSocket(req, socket)) {
      // Även en host-hållen stub-socket betyder "en iframe är öppen" — räkna
      // den så idle-reapern inte stoppar en runtime någon tittar på.
      registerPreviewSocket(info.chatId, socket);
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
  // och håll socketen tyst tills runtimen är uppe; nästa full-reload via
  // refreshToken plockar upp det nya innehållet.
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
        registerPreviewSocket(info.chatId, socket);
        return true;
      }
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
  }
  const runtime = await ensureRuntimeForChat(info.chatId);
  if (!runtime) return false;
  const trackedForActivity = runtimeChildren.get(runtime.session.sessionId);
  if (trackedForActivity) trackedForActivity.lastActivityAt = Date.now();
  registerPreviewSocket(info.chatId, socket);
  rewriteRequestUrl(req, info.chatId, info.restPath, search);
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

// Inspector-bridge-injektion: aktiv ENDAST när `req.__inspectInjectTag` satts
// (dvs `?inspect=1` + konfigurerad app-origin). Allt annat: ren passthrough så
// att dagens preview-beteende är oförändrat.
proxy.on("proxyRes", (proxyRes, req, res) => {
  const tag = req.__inspectInjectTag;
  if (!tag) return; // selfHandleResponse var av → http-proxy skriver själv

  const status = proxyRes.statusCode || 502;
  const headers = Object.assign({}, proxyRes.headers);
  const ct = String(headers["content-type"] || "").toLowerCase();
  const enc = String(headers["content-encoding"] || "").toLowerCase();
  const injectable = ct.includes("text/html") && (!enc || enc === "identity");

  if (!injectable) {
    // Icke-HTML eller komprimerat → ingen säker injektion, passthrough rakt av.
    if (!res.headersSent) res.writeHead(status, headers);
    proxyRes.pipe(res);
    return;
  }

  const chunks = [];
  let total = 0;
  let bailed = false;
  proxyRes.on("data", (chunk) => {
    if (bailed) return;
    total += chunk.length;
    if (total > INSPECT_BRIDGE_MAX_HTML_BYTES) {
      // För stort att buffra → spola ut det vi har och fall tillbaka till pipe.
      bailed = true;
      if (!res.headersSent) {
        delete headers["content-length"];
        res.writeHead(status, headers);
      }
      for (const c of chunks) res.write(c);
      res.write(chunk);
      proxyRes.pipe(res);
    } else {
      chunks.push(chunk);
    }
  });
  proxyRes.on("end", () => {
    if (bailed) { try { res.end(); } catch { /* redan stängd */ } return; }
    let body = Buffer.concat(chunks).toString("utf8");
    const idx = body.toLowerCase().lastIndexOf("</body>");
    body = idx !== -1 ? body.slice(0, idx) + tag + body.slice(idx) : body + tag;
    const out = Buffer.from(body, "utf8");
    // Vi skickar en helt buffrad body med explicit Content-Length, så ev.
    // upstream Transfer-Encoding (t.ex. chunked) MASTE bort — att skicka bade
    // Content-Length och Transfer-Encoding ger ett ogiltigt HTTP-svar som
    // bracker preview-laddningen for chunkad HTML.
    delete headers["transfer-encoding"];
    headers["content-length"] = String(out.length);
    headers["cache-control"] = "no-store";
    if (!res.headersSent) res.writeHead(status, headers);
    res.end(out);
  });
  proxyRes.on("error", () => {
    try { if (!res.headersSent) res.writeHead(502); res.end(); } catch { /* ignore */ }
  });
});

proxy.on("error", (err, req, res) => {
  const isHttpResponse = res && typeof res.writeHead === "function";

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
  NEXT_INTERNAL_ROOT_PATH_RE,
  shouldHoldPrewarmTraffic,
};
