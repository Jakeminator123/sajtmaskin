"use strict";

// Processlivscykel: boot/restart-serialisering, dev-server-spawn, readiness,
// Fast Edit Lane-patchning av live-runtimen, hibernate och idle-reaper.
// Ren extraktion ur runtime.js — ingen beteendeändring.

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const { readStoreSync } = require("./../store.js");
const {
  LOOPBACK,
  activePreviewSocketCount,
  activeVerifyChatKeys,
  markPendingPreviewClientReload,
  requestPreviewClientReload,
  appendRuntimeLog,
  findSessionByChatId,
  getSessionChatId,
  inflightBootByChat,
  isHmrProxyEnabled,
  nowIso,
  resolvePortForChat,
  runIdResolverFromSession,
  runtimeChildren,
  safeChatKey,
  sanitizedEnv,
  spawnNpm,
  updateSessionById,
} = require("./shared.js");
const {
  patchNextConfigForPreviewBasePath,
  patchTouchesStructuralPath,
  patchWorkspaceFiles,
  writeWorkspaceFiles,
} = require("./workspace-files.js");
const { runInstallCommand } = require("./package-install.js");
// Ingen load-cykel: storage-cleanup kräver denna modul enbart via en lazy
// require inuti stopStaleRuntimes (körs långt efter att allt laddats).
const { withNoSpaceCleanupRetry } = require("./storage-cleanup.js");

const READINESS_INTERVAL_MS = 1200;
const READINESS_EMPTY_BODY_MIN_CHARS = 50;
/** Per-attempt fetch abort. The connect-fail window is wall-clock; a 90s abort would double it. */
const READINESS_FETCH_TIMEOUT_MS = 8000;

/** Read at call time so guard tests can shrink the deadline without reloading the module. */
function readinessMaxMs() {
  const parsed = parseInt(process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS ?? "180000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180_000;
}

/**
 * Separate, much shorter deadline for the "HTTP 200 HTML but no meaningful
 * visible body text" condition.
 *
 * Accepting an empty body after ~6s was a false-green (`preview_success` on a
 * blank page), but inheriting the FULL readiness deadline is the opposite
 * failure: `PREVIEW_HOST_RUNTIME_READY_MAX_MS` is 600 000 ms on Fly, and
 * `waitForReady` fetches HTML without executing JavaScript — so a preview that
 * renders client-side (heavy `"use client"` + effect fetching, or a text-free
 * Suspense skeleton) never gains visible text no matter how long we wait. That
 * page would sit in "Startar preview" for ten minutes before failing, which is
 * the very symptom this whole change set exists to remove.
 *
 * 90s is chosen to clear a genuinely cold first compile (the observed prod
 * cases resolved within seconds once compilation finished) while keeping the
 * failure honest and fast. Capped by the overall readiness deadline so a
 * shrunken deadline in tests still wins.
 */
function readinessEmptyBodyMaxMs() {
  const parsed = parseInt(
    process.env.PREVIEW_HOST_RUNTIME_READY_EMPTY_BODY_MAX_MS ?? "90000",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90_000;
}

/**
 * Continuous fetch-failure window after `next dev` is spawned.
 *
 * Empty-body already has its own short deadline, but a process that never
 * binds the port (stale Next lock, hung compile, dead child) keeps throwing
 * `fetch failed` and inherited the full Fly deadline (10 minutes of
 * "Startar preview"). 90s covers a cold first listen without hiding a
 * server that will never accept HTTP.
 */
function readinessConnectFailMaxMs() {
  const parsed = parseInt(
    process.env.PREVIEW_HOST_RUNTIME_READY_CONNECT_MAX_MS ?? "90000",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90_000;
}
// Drain-fönster mellan SIGTERM och SIGKILL när en runtime stoppas (t.ex. vid
// avsiktlig restart). Default 5000 ms = oförändrat beteende; höj för att låta
// pågående HTTP-svar hinna klart innan processen tvångsdödas (mildrar
// "socket hang up"/PU02 vid restart). Reversibelt via env.
const RUNTIME_DRAIN_MS = parseInt(process.env.PREVIEW_HOST_RUNTIME_DRAIN_MS ?? "5000", 10);
// Idle-reaper (M#fly1): en dev-runtime utan preview-trafik (HTTP eller öppen
// WebSocket från en iframe) stoppas efter detta fönster och sessionen markeras
// `hibernated`. Nästa besök bootar om den via den vanliga startsidan. Detta är
// VM-sidans skyddsnät — klientens hibernate-anrop (pagehide / dold tab) är
// best-effort och når inte alltid fram, och utan reapern levde varje dev-server
// kvar till sessions-TTL:en (2 h på Fly) och trängde ut `npm install` (OOM).
// 0 eller negativt värde stänger av reapern.
const RUNTIME_IDLE_STOP_MS = parseInt(
  process.env.PREVIEW_HOST_RUNTIME_IDLE_STOP_MS ?? `${10 * 60 * 1000}`,
  10,
);
// Observability (README handoff #5): behåll en liten ringbuffert av senaste
// stdout/stderr-rader per runtime så att en tail kan ytliggöras i runtime-loggen
// vid onormal exit (i stället för att tystas helt).
const RUNTIME_OUTPUT_RING_MAX = 60;
const RUNTIME_OUTPUT_LINE_MAX = 500;
const RUNTIME_OUTPUT_EXIT_TAIL = 30;
// A dev server may exit with code 0 even though it never became ready (for
// example when Next mutates the dependency set during boot). Proxy traffic
// would otherwise restart it forever and each boot would overwrite readiness
// back to `starting`. Three unexpected clean exits for the same session+version
// within two minutes are therefore terminal until an explicit start/update
// retries the session.
const RUNTIME_CLEAN_EXIT_LIMIT = 3;
const RUNTIME_CLEAN_EXIT_WINDOW_MS = 2 * 60 * 1000;
// Install/boot failures (pnpm exit 1, postcondition, spawn) are distinct from
// clean process exits above. Splash refresh + ensureRuntimeForChat used to
// clear status back to `starting` and retry forever; three failures for the
// same version within two minutes are terminal so readinessState=failed stays
// visible to the app (preview-status → engine_version_error_logs).
const RUNTIME_BOOT_FAILURE_LIMIT = 3;
const RUNTIME_BOOT_FAILURE_WINDOW_MS = 2 * 60 * 1000;
let nextRuntimeBootId = 1;

function classifyRuntimeCleanExitLoop({ timestamps, now = Date.now() }) {
  const recent = (Array.isArray(timestamps) ? timestamps : [])
    .filter((value) => Number.isFinite(value) && now - value <= RUNTIME_CLEAN_EXIT_WINDOW_MS)
    .concat(now);
  return {
    timestamps: recent,
    failed: recent.length >= RUNTIME_CLEAN_EXIT_LIMIT,
  };
}

function classifyRuntimeBootFailureLoop({ timestamps, now = Date.now(), record = true }) {
  const recent = (Array.isArray(timestamps) ? timestamps : []).filter(
    (value) => Number.isFinite(value) && now - value <= RUNTIME_BOOT_FAILURE_WINDOW_MS,
  );
  if (!record) {
    return {
      timestamps: recent,
      failed: recent.length >= RUNTIME_BOOT_FAILURE_LIMIT,
    };
  }
  const next = recent.concat(now);
  return {
    timestamps: next,
    failed: next.length >= RUNTIME_BOOT_FAILURE_LIMIT,
  };
}

function bootFailureTimestampsForSession(session) {
  if (
    session &&
    session.runtimeBootFailureVersionId === session.versionId &&
    Array.isArray(session.runtimeBootFailureTimestamps)
  ) {
    return session.runtimeBootFailureTimestamps;
  }
  return [];
}

/**
 * Re-probe readiness after a hot patch (HMR), bound to the version that was
 * patched.
 *
 * A hot patch deliberately leaves the dev process alive, so none of the boot
 * path runs — and readiness is written only by the boot path. The session
 * therefore keeps the PREVIOUS boot's `readinessState: "ready"` while Next has
 * not even recompiled the new files yet, and a patch that introduces a build
 * error stays "ready" forever: a false-green with a preview URL that renders
 * an overlay.
 *
 * The probe is version-bound in BOTH directions. The route flips readiness to
 * `starting` for the new version before this runs, and every write here is
 * guarded on `stored.versionId` still being the version we probed — so a slow
 * result belonging to an older patch can never stamp a newer version.
 */
async function probeReadinessAfterPatch({ chatId, sessionId, previewSessionId, versionId }) {
  const { runtimePort } = getRuntimeStateForChat(chatId);
  if (!runtimePort || !sessionId || !versionId) return;
  const url = `http://${LOOPBACK}:${runtimePort}/${encodeURIComponent(chatId)}/`;
  try {
    await waitForReady(url);
    await updateSessionById(sessionId, (stored) => {
      if (stored.versionId !== versionId) return;
      stored.readinessState = "ready";
      stored.readinessError = null;
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      previewSessionId,
      `Readiness confirmed after hot patch (version ${versionId}).`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown readiness failure";
    await updateSessionById(sessionId, (stored) => {
      if (stored.versionId !== versionId) return;
      stored.readinessState = "failed";
      stored.readinessError = message;
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      previewSessionId,
      `Readiness failed after hot patch (version ${versionId}): ${message}`,
    );
  }
}

/**
 * Apply a Fast Edit Lane patch to the live runtime for a chat.
 * - Structural/config change -> full restart (npm install / config reload).
 * - Runtime not running, OR a (re)boot already in flight -> force a restart boot
 *   from the merged session filesJson (caller merges before invoking this).
 * - Otherwise -> write only the changed files; leave the dev process alive.
 * - On a synchronous workspace-write failure (e.g. ENOSPC) -> return
 *   `{ mode: "error" }` so the caller can roll the session back instead of
 *   advertising a version that never actually landed on disk.
 */
function applyRuntimePatch(chatId, { files, removedPaths } = {}) {
  const changed = files && typeof files === "object" ? files : {};
  const removed = Array.isArray(removedPaths) ? removedPaths : [];
  const allPaths = [...Object.keys(changed), ...removed];
  if (patchTouchesStructuralPath(allPaths)) {
    queueRuntimeBoot(chatId, { restart: true });
    return { mode: "restarted", reason: "structural_change" };
  }
  const runtimeState = getRuntimeStateForChat(chatId);
  if (!runtimeState.running || runtimeState.booting) {
    // Not running / still cold-booting -> a plain non-restart boot would dedupe
    // to an in-flight boot that may have already snapshotted the pre-patch
    // filesJson, so the VM could come up serving stale files even though the
    // session was advanced.
    //
    // FEL-4: even when the OLD dev process is still alive (`running === true`)
    // but a restart boot is already in flight (`booting === true`), a hot file
    // write races that boot — the boot may rewrite the whole workspace from a
    // pre-patch snapshot and clobber the patched files. In both cases force a
    // restart boot: ensureRuntimeForChat waits for any in-flight boot to finish,
    // then re-boots from the merged filesJson the caller already committed.
    queueRuntimeBoot(chatId, { restart: true });
    return {
      mode: "booted",
      reason: runtimeState.running ? "runtime_booting" : "runtime_not_running",
    };
  }
  try {
    patchWorkspaceFiles(chatId, changed, removed);
  } catch (error) {
    // Surface the failure so the patch route can roll the session back (the
    // dev process is still serving the pre-patch files). ENOSPC messages flow
    // back to the app client, which triggers /admin/cleanup + one retry.
    return {
      mode: "error",
      reason: error instanceof Error ? error.message : "Workspace patch write failed.",
    };
  }
  return { mode: "patched", reason: null };
}

function responseHeadersLookLikeHtmlDocument(res) {
  if (!res.ok) return false;
  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!ct.trim()) return true;
  return (
    ct.includes("text/html") ||
    ct.includes("text/x-component") ||
    ct.includes("application/xhtml+xml")
  );
}

// Next.js dev serves an HTTP 200 HTML page for build/compile errors (the
// full-screen "Build Error" / "Failed to compile" overlay, and the
// module-not-found error). That page HAS visible text, so the plain
// "meaningful visible text" check below would ACCEPT it as ready — the exact
// false-green behind the radix-ui incident (readiness ≠ HTTP-ready). Detect the
// overlay so readiness rejects it instead of stamping preview_success.
//
// STRONG signatures are the Next compiler's own prose. They do not appear in
// healthy pages, so a match anywhere in the document is trusted on its own.
const NEXT_BUILD_ERROR_STRONG_SIGNATURES = [
  /Failed to compile/i,
  /This error occurred during the build process/i,
  /__NEXT_ERROR_OVERLAY__/i,
];

// GENERIC signatures are ordinary English phrases that legitimately appear in
// real page CONTENT: preview-host serves arbitrary v0/user projects, and error
// dashboards, log viewers, monitoring UIs and docs routinely render text like
// "Module not found" or "Unhandled Runtime Error". Matching these anywhere
// would keep a perfectly healthy preview from ever going live, so they only
// count together with a structural marker that identifies the response as the
// Next dev error page.
const NEXT_BUILD_ERROR_GENERIC_SIGNATURES = [
  /Build Error/i,
  /Module not found/i,
  /Cannot find module/i,
  /Unhandled Runtime Error/i,
];

const NEXT_DEV_OVERLAY_MARKERS = [
  /__NEXT_ERROR_OVERLAY__/i,
  /nextjs-portal/i,
  /data-nextjs-dialog/i,
  /data-nextjs-error/i,
  /nextjs__container_errors/i,
  /id=["']?__next_error__/i,
];

function extractBuildErrorMessage(html) {
  const preMatch = html.match(/<pre[^>]*>([\s\S]{0,400}?)<\/pre>/i);
  if (preMatch) {
    const text = preMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 300);
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  if (titleMatch) {
    const text = titleMatch[1].replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 200);
  }
  return "Next.js build error overlay";
}

function htmlLooksLikeBuildError(html) {
  const text = String(html || "");
  if (!text) return false;
  if (NEXT_BUILD_ERROR_STRONG_SIGNATURES.some((re) => re.test(text))) return true;
  return (
    NEXT_BUILD_ERROR_GENERIC_SIGNATURES.some((re) => re.test(text)) &&
    NEXT_DEV_OVERLAY_MARKERS.some((re) => re.test(text))
  );
}

function htmlBodyHasMeaningfulVisibleText(html) {
  let snippet = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    snippet = bodyMatch[1];
  }
  const withoutScripts = snippet.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const visible = withoutStyles.replace(/<[^>]+>/g, "");
  return visible.trim().length >= READINESS_EMPTY_BODY_MIN_CHARS;
}

// A persistent Next build-error overlay never clears on its own (the code is
// broken), so once we have seen it consistently we fail readiness fast instead
// of burning the full 180s deadline. A brief overlay during first compile is
// tolerated (HMR can clear it), hence the streak.
const READINESS_MAX_BUILD_ERROR_RETRIES = 4;

/**
 * Messages that are readiness VERDICTS rather than transient fetch failures.
 * `waitForReady` throws both from inside its own `try`, so the `catch` must
 * re-throw them instead of recording them as "last error" and looping.
 */
const READINESS_VERDICT_RE = /build error overlay|empty body for \d+ms|never accepted HTTP/i;

async function waitForReady(url) {
  // Empty HTML body is treated like any other "not ready yet" signal: keep
  // polling until meaningful visible text appears. Accepting after a handful of
  // empty polls (~6s) was a false-green — cold starts routinely compile longer
  // than that, so `preview_success` got stamped mid-compile on a blank page.
  //
  // It gets its OWN deadline rather than the full readiness one: a page that
  // renders client-side never gains visible text in a JS-less fetch, and making
  // it wait out the 600s Fly deadline would trade the false-green for a
  // ten-minute "Startar preview" hang. See readinessEmptyBodyMaxMs().
  //
  // Either deadline expiring throws, so the boot path records
  // readinessState=failed through the same channel as build-error overlays
  // (#799) and preview_success is never stamped true on a blank page.
  const readinessMaxMsValue = readinessMaxMs();
  const emptyBodyMaxMsValue = Math.min(readinessEmptyBodyMaxMs(), readinessMaxMsValue);
  const connectFailMaxMsValue = Math.min(readinessConnectFailMaxMs(), readinessMaxMsValue);
  const startedAt = Date.now();
  const deadline = startedAt + readinessMaxMsValue;
  let lastError = "";
  let buildErrorStreak = 0;
  let lastBuildErrorMessage = "";
  let firstEmptyBodyAt = null;
  let firstConnectFailAt = null;
  while (Date.now() < deadline) {
    const remainingConnectMs =
      firstConnectFailAt === null
        ? connectFailMaxMsValue
        : Math.max(1, connectFailMaxMsValue - (Date.now() - firstConnectFailAt));
    const fetchTimeoutMs = Math.min(READINESS_FETCH_TIMEOUT_MS, remainingConnectMs);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    const attemptStartedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      });
      if (!responseHeadersLookLikeHtmlDocument(res)) {
        buildErrorStreak = 0;
        firstEmptyBodyAt = null;
        firstConnectFailAt = null;
        lastError = `HTTP ${res.status}`;
        await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
        continue;
      }
      const text = await res.text();
      // Readiness ≠ process running: a Next build-error overlay is HTTP 200
      // HTML with visible text but is NOT a ready page. Reject it (and fail
      // fast once it looks persistent) so preview_success is never stamped on
      // a page that is really showing a build error.
      if (htmlLooksLikeBuildError(text)) {
        buildErrorStreak += 1;
        firstEmptyBodyAt = null;
        firstConnectFailAt = null;
        lastBuildErrorMessage = extractBuildErrorMessage(text);
        lastError = `Next.js build error overlay: ${lastBuildErrorMessage}`;
        if (buildErrorStreak >= READINESS_MAX_BUILD_ERROR_RETRIES) {
          throw new Error(
            `Runtime is serving a Next.js build error overlay (not ready): ${lastBuildErrorMessage}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
        continue;
      }
      buildErrorStreak = 0;
      firstConnectFailAt = null;
      if (htmlBodyHasMeaningfulVisibleText(text)) {
        return;
      }
      lastError = "HTTP 200 HTML but body text still empty (compiling or blank page)";
      // Time the empty-body window from the FIRST empty response, not from boot:
      // install and the initial compile can precede it by minutes, and that time
      // is not evidence about the page.
      if (firstEmptyBodyAt === null) firstEmptyBodyAt = Date.now();
      if (Date.now() - firstEmptyBodyAt >= emptyBodyMaxMsValue) {
        throw new Error(
          `Runtime served HTML with an empty body for ${emptyBodyMaxMsValue}ms ` +
            `(not ready): ${lastError}`,
        );
      }
    } catch (err) {
      // A thrown readiness VERDICT (build-error overlay, empty-body deadline) is
      // terminal — propagate it rather than treating it like a transient fetch
      // error and looping to timeout.
      if (err instanceof Error && READINESS_VERDICT_RE.test(err.message)) {
        throw err;
      }
      buildErrorStreak = 0;
      // A failed fetch is not evidence about the body, so the empty-body window
      // measures a CONTIGUOUS run of empty responses.
      firstEmptyBodyAt = null;
      lastError = err instanceof Error ? err.message : String(err);
      if (firstConnectFailAt === null) firstConnectFailAt = attemptStartedAt;
      if (Date.now() - firstConnectFailAt >= connectFailMaxMsValue) {
        throw new Error(
          `Runtime never accepted HTTP within ${connectFailMaxMsValue}ms ` +
            `(not ready): ${lastError}`,
        );
      }
    } finally {
      clearTimeout(tid);
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
  throw new Error(
    `Runtime did not become ready within ${readinessMaxMsValue}ms. Last error: ${lastError}`,
  );
}

function stopChildProcessTree(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.once("close", () => resolve());
      return;
    }
    const signalProcessGroup = (signal) => {
      try {
        // `npm run dev` owns a shell + the actual dev server. The child is
        // spawned as a POSIX process-group leader below so both generations
        // receive shutdown signals; killing only npm leaves the server alive
        // with stdout/stderr pipes open and this promise never settles.
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    signalProcessGroup("SIGTERM");
    const drainMs =
      Number.isFinite(RUNTIME_DRAIN_MS) && RUNTIME_DRAIN_MS >= 0 ? RUNTIME_DRAIN_MS : 5000;
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        signalProcessGroup("SIGKILL");
      }
    }, drainMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function runtimeOutputTail(tracked) {
  if (!tracked || !Array.isArray(tracked.recentOutput) || tracked.recentOutput.length === 0) {
    return "";
  }
  return tracked.recentOutput.slice(-RUNTIME_OUTPUT_EXIT_TAIL).join("\n");
}

async function flushRuntimeOutputTail(tracked, previewSessionId, reason) {
  const tail = runtimeOutputTail(tracked);
  const sessionId =
    typeof previewSessionId === "string" && previewSessionId.trim()
      ? previewSessionId.trim()
      : typeof tracked?.previewSessionId === "string"
        ? tracked.previewSessionId.trim()
        : "";
  if (!tail || !sessionId) return "";
  await appendRuntimeLog(sessionId, `Last Next.js output (${reason}):\n${tail}`);
  return tail;
}

function workspaceHasLiveTrackedChild(workspaceDir) {
  const resolved = path.resolve(workspaceDir);
  for (const tracked of runtimeChildren.values()) {
    if (!tracked?.workspaceDir) continue;
    if (path.resolve(tracked.workspaceDir) !== resolved) continue;
    if (tracked.child?.exitCode === null) return true;
  }
  return false;
}

function readNextDevLockPid(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearStaleNextDevLock(workspaceDir) {
  if (!workspaceDir) return;
  if (workspaceHasLiveTrackedChild(workspaceDir)) return;
  for (const lockPath of [
    path.join(workspaceDir, ".next", "dev", "lock"),
    path.join(workspaceDir, ".next", "lock"),
  ]) {
    try {
      const pid = readNextDevLockPid(lockPath);
      if (pid != null && isPidAlive(pid)) continue;
      fs.rmSync(lockPath, { force: true });
    } catch {
      // Best-effort: a missing or busy lock must not block spawn.
    }
  }
}

async function stopTrackedRuntime(sessionId, previewSessionId = null) {
  const tracked = runtimeChildren.get(sessionId);
  if (!tracked) return false;
  runtimeChildren.delete(sessionId);
  tracked.ignoreExit = true;
  // Hibernate/idle/restart used to drop the in-memory Next tail. Persist it
  // before SIGTERM so /preview/logs still explains a boot that never answered.
  // A store/log failure must not skip SIGTERM — the child would stay in
  // runtimeChildren's former slot as an orphan.
  try {
    await flushRuntimeOutputTail(tracked, previewSessionId, "before stop");
  } catch {
    // keep stopping
  }
  await stopChildProcessTree(tracked.child);
  if (previewSessionId) {
    try {
      await appendRuntimeLog(previewSessionId, "Runtime stopped.");
    } catch {
      // stop already happened
    }
  }
  return true;
}

async function stopRuntimeForSession(session) {
  await stopTrackedRuntime(session.sessionId, session.previewSessionId);
}

function isLiveBoot(sessionId, bootId) {
  if (bootId == null) return false;
  const tracked = runtimeChildren.get(sessionId);
  return Boolean(tracked && tracked.bootId === bootId && tracked.child?.exitCode === null);
}

function exposeRuntimeToClients(session, { restart = false, runtimePort = null, bootId = null } = {}) {
  const chatId = getSessionChatId(session);
  const latest = findSessionByChatId(readStoreSync(), chatId);
  if (!latest || latest.versionId !== session.versionId) return false;
  const tracked = runtimeChildren.get(session.sessionId);
  if (!tracked || tracked.child?.exitCode !== null) return false;
  if (runtimePort != null && tracked.port !== runtimePort) return false;
  if (bootId != null && tracked.bootId !== bootId) return false;
  // Reload first while traffic is still gated. Held HMR stubs are the open
  // iframe; flipping acceptingTraffic first would let a racy JS fetch hit the
  // new build before the document is discarded.
  if (restart) {
    requestPreviewClientReload(chatId);
  }
  tracked.acceptingTraffic = true;
  return true;
}

async function spawnDevServer(session, workspaceDir, runtimePort) {
  // Defense-in-depth (prod-incident 2026-07-03): never overwrite a live
  // tracked child. `runtimeChildren.set` below would orphan the previous
  // process, which keeps holding Next 16's workspace dev-lock and kills every
  // later boot with "Another next dev server is already running". Boots are
  // serialized per chat, so this is normally a no-op — it only fires if a
  // prior child survived an aborted/raced boot path.
  await stopTrackedRuntime(session.sessionId, null);
  clearStaleNextDevLock(workspaceDir);
  const chatId = getSessionChatId(session);
  const basePath = `/${chatId}`;
  const runId = runIdResolverFromSession(session);
  const child = spawnNpm(
    ["run", "dev", "--", "--hostname", LOOPBACK, "--port", String(runtimePort)],
    {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      // Required by stopChildProcessTree's negative-PID signaling on POSIX.
      // Keep Windows attached so taskkill /t remains the tree owner there.
      detached: process.platform !== "win32",
      env: sanitizedEnv({
        PORT: String(runtimePort),
        HOSTNAME: LOOPBACK,
        SAJTMASKIN_PREVIEW_BASE_PATH: basePath,
        // Default-on: tystar webpack-HMR-WS i preview-VM så Chrome-konsolen
        // inte spammas med "WebSocket connection ... failed". Hot-reload
        // tappas men sajten reload:as ändå vid varje generation. Sätt till
        // "false" för att återaktivera HMR (t.ex. när man debuggar VM:en
        // direkt). Fast Edit Lane Fas 4: när HMR-proxyn är på tvingar vi
        // DISABLE_HMR=false så Next behåller HMR-pluginen och emitterar events
        // som proxyn vidarebefordrar (true hot reload utan iframe-reload).
        SAJTMASKIN_PREVIEW_DISABLE_HMR: isHmrProxyEnabled()
          ? "false"
          : (process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR ?? "true"),
        ...(runId ? { SAJTMASKIN_PREVIEW_RUN_ID: runId } : {}),
      }),
    },
  );

  const tracked = {
    child,
    port: runtimePort,
    ignoreExit: false,
    workspaceDir,
    chatId,
    previewSessionId: session.previewSessionId,
    // Idle-reaper: stämplas om vid varje proxad request/WS-upgrade. Boot räknas
    // som aktivitet så en nystartad runtime inte reapas innan iframen hunnit in.
    lastActivityAt: Date.now(),
    // SM-044: process may be alive while waitForReady has not passed. The
    // proxy must not forward app HTML/JS until this flips, or an open iframe
    // can hydrate old markup against the new build.
    acceptingTraffic: false,
    bootId: nextRuntimeBootId++,
    // (D) Ringbuffert av senaste Next.js-output. Live-loggning av allt dev-brus
    // (HMR m.m.) skulle flooda store:n; vi behåller bara en tail i minnet och
    // flushar den vid onormal exit så boot-/runtime-fel blir synliga.
    recentOutput: [],
  };
  runtimeChildren.set(session.sessionId, tracked);

  const captureRuntimeOutput = (chunk) => {
    const text = String(chunk);
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      tracked.recentOutput.push(
        line.length > RUNTIME_OUTPUT_LINE_MAX ? `${line.slice(0, RUNTIME_OUTPUT_LINE_MAX)}…` : line,
      );
    }
    if (tracked.recentOutput.length > RUNTIME_OUTPUT_RING_MAX) {
      tracked.recentOutput.splice(0, tracked.recentOutput.length - RUNTIME_OUTPUT_RING_MAX);
    }
  };
  child.stdout.on("data", captureRuntimeOutput);
  child.stderr.on("data", captureRuntimeOutput);

  child.once("exit", async (code, signal) => {
    runtimeChildren.delete(session.sessionId);
    if (tracked.ignoreExit) return;
    const outputTail = tracked.recentOutput.slice(-RUNTIME_OUTPUT_EXIT_TAIL).join("\n");
    let cleanExitLoopDetected = false;
    await updateSessionById(session.sessionId, (stored) => {
      if (stored.versionId !== session.versionId) return;
      if (code === 0 && signal == null) {
        const priorTimestamps =
          stored.runtimeCleanExitVersionId === session.versionId &&
          Array.isArray(stored.runtimeCleanExitTimestamps)
            ? stored.runtimeCleanExitTimestamps
            : [];
        const next = classifyRuntimeCleanExitLoop({
          timestamps: priorTimestamps,
          now: Date.now(),
        });
        stored.runtimeCleanExitVersionId = session.versionId;
        stored.runtimeCleanExitTimestamps = next.timestamps;
        cleanExitLoopDetected = next.failed;
      }
      stored.status = cleanExitLoopDetected ? "error" : "stopped";
      stored.stoppedAt = nowIso();
      if (cleanExitLoopDetected) {
        stored.readinessState = "failed";
        stored.readinessError = [
          `Preview runtime exited cleanly ${RUNTIME_CLEAN_EXIT_LIMIT} times within ${Math.round(RUNTIME_CLEAN_EXIT_WINDOW_MS / 1000)} seconds before readiness completed.`,
          outputTail ? `Last Next.js output:\n${outputTail}` : "No Next.js output was captured.",
        ].join("\n");
      }
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.previewSessionId,
      `Runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
    if (cleanExitLoopDetected) {
      await appendRuntimeLog(
        session.previewSessionId,
        `Runtime clean-exit restart limit reached for version ${session.versionId}; readiness marked failed.`,
      );
    }
    // (D) Endast vid onormal exit (krasch/boot-fel) — rena stopp sätter
    // `ignoreExit` och returnerar ovan, så hibernate/destroy/restart dumpar inget.
    if (tracked.recentOutput.length > 0) {
      const tail = tracked.recentOutput.slice(-RUNTIME_OUTPUT_EXIT_TAIL).join("\n");
      await appendRuntimeLog(
        session.previewSessionId,
        `Last Next.js output before exit (tail):\n${tail}`,
      );
    }
  });

  await appendRuntimeLog(
    session.previewSessionId,
    `Starting dev runtime on port ${runtimePort} for chat ${chatId}.`,
  );
}

async function bootRuntimeForSession(session, options = {}) {
  const restart = options.restart === true;
  if (!session.filesJson || typeof session.filesJson !== "object") {
    throw new Error("Session is missing filesJson for runtime boot.");
  }
  if (restart) {
    // ensureRuntimeForChat already stopped the old process and sent
    // requestPreviewClientReload. A direct restart boot still needs the stop.
    await stopRuntimeForSession(session);
  } else {
    const existing = runtimeChildren.get(session.sessionId);
    if (existing && existing.child.exitCode === null) {
      return { runtimePort: existing.port };
    }
    const stoppedAt = Date.parse(session.stoppedAt ?? "");
    if (Number.isFinite(stoppedAt) && Date.now() - stoppedAt < 5000) {
      throw new Error("Runtime stopped recently; waiting before retry.");
    }
  }

  const priorBootFailures = classifyRuntimeBootFailureLoop({
    timestamps: bootFailureTimestampsForSession(session),
    record: false,
  });
  if (priorBootFailures.failed) {
    const terminalMessage = [
      `Preview boot failed ${RUNTIME_BOOT_FAILURE_LIMIT} times within ${Math.round(RUNTIME_BOOT_FAILURE_WINDOW_MS / 1000)} seconds.`,
      "Retry from the builder after fixing the project, or wait for the failure window to expire.",
    ].join(" ");
    await updateSessionById(session.sessionId, (stored) => {
      if (stored.versionId !== session.versionId) return;
      stored.status = "error";
      stored.runtimeBootFailureVersionId = session.versionId;
      stored.runtimeBootFailureTimestamps = priorBootFailures.timestamps;
      if (session.prewarm !== true) {
        stored.readinessState = "failed";
        stored.readinessError =
          typeof stored.readinessError === "string" && stored.readinessError.trim()
            ? stored.readinessError
            : terminalMessage;
      }
      stored.updatedAt = nowIso();
    });
    throw new Error(terminalMessage);
  }

  await updateSessionById(session.sessionId, (stored) => {
    stored.status = "starting";
    // A start request writes `starting` before it queues the boot. Treat that
    // as an explicit retry and give the same version a fresh exit budget.
    // Update requests reset the budget atomically in their route mutation
    // because normal updates use `warm_project` here. Proxy-driven recovery
    // starts from `stopped` and preserves the counter.
    if (session.status === "starting") {
      stored.runtimeCleanExitVersionId = session.versionId;
      stored.runtimeCleanExitTimestamps = [];
    }
    // Drop a previous boot's readiness verdict before any new child is
    // spawned. A stale `failed` plus a gated live process opens the
    // SM-044 traffic bypass (`running && readinessState === "failed"`).
    // Port-matching cannot close that hole: resolvePortForChat often
    // reuses the same port. Prewarm skeletons stay stateless.
    if (session.prewarm !== true) {
      stored.readinessState = "starting";
      stored.readinessError = null;
    }
    // A new boot must not keep the previous install snapshot on `/status`.
    delete stored.installDiagnostics;
    stored.updatedAt = nowIso();
  });

  try {
    const chatId = getSessionChatId(session);
    const isPrewarm = session.prewarm === true;
    const runBoot = async () => {
      const workspaceDir = writeWorkspaceFiles(chatId, session.filesJson);
      patchNextConfigForPreviewBasePath(workspaceDir);
      const runtimePort = await resolvePortForChat(chatId, Number(session.runtimePort));
      // Install (+ stale-lockfile reconcile + dependency postcondition). Throws
      // on install/postcondition failure → outer catch sets status "error", so
      // a broken dependency graph never reaches a running preview.
      const installOutcome = await runInstallCommand(
        workspaceDir,
        session.previewSessionId,
        session.filesJson,
      );
      await spawnDevServer(session, workspaceDir, runtimePort);
      const spawnedBootId = runtimeChildren.get(session.sessionId)?.bootId ?? null;

      await updateSessionById(session.sessionId, (stored) => {
        if (stored.versionId !== session.versionId) return;
        stored.status = "warm_project";
        stored.runtimePort = runtimePort;
        stored.updatedAt = nowIso();
        // A successful boot clears the install/boot failure budget for this version.
        stored.runtimeBootFailureVersionId = session.versionId;
        stored.runtimeBootFailureTimestamps = [];
        // Readiness is not yet confirmed (page not proven build-error-free).
        // Prewarm skeletons keep today's stateless behaviour.
        if (!isPrewarm) {
          stored.readinessState = "starting";
          stored.readinessError = null;
        }
        delete stored.installDiagnostics;
        // Surface the regenerated lockfile so the app can persist it and clear
        // the stale marker (`/status` returns these fields).
        if (installOutcome && installOutcome.regeneratedLockfile) {
          stored.regeneratedLockfile = installOutcome.regeneratedLockfile;
          stored.lockfileStaleCleared = true;
        }
      });

      const readiness = waitForReady(
        `http://${LOOPBACK}:${runtimePort}/${encodeURIComponent(chatId)}/`,
      );
      // Record the readiness OUTCOME into the session for non-prewarm boots.
      // Previously the normal path fired readiness fire-and-forget and only
      // logged, so an async boot failure after HTTP 201 (build-error overlay)
      // never reached the app / RepairGate. Now `readinessState` flips to
      // "ready"/"failed" and `/status` exposes it → the app stamps
      // preview_success accordingly and can fire the build-error repair path.
      if (!isPrewarm) {
        void readiness
          .then(() =>
            updateSessionById(session.sessionId, (stored) => {
              if (stored.versionId !== session.versionId) return;
              if (!isLiveBoot(session.sessionId, spawnedBootId)) return;
              stored.readinessState = "ready";
              stored.readinessError = null;
              stored.updatedAt = nowIso();
            }),
          )
          .then(() => {
            exposeRuntimeToClients(session, { restart, runtimePort, bootId: spawnedBootId });
            return appendRuntimeLog(
              session.previewSessionId,
              `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
            );
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : "unknown readiness failure";
            const tracked = runtimeChildren.get(session.sessionId);
            const tail = runtimeOutputTail(tracked);
            const withTail = tail ? `${message}\nLast Next.js output:\n${tail}` : message;
            return updateSessionById(session.sessionId, (stored) => {
              if (stored.versionId !== session.versionId) return;
              if (!isLiveBoot(session.sessionId, spawnedBootId)) return;
              stored.readinessState = "failed";
              stored.readinessError = withTail;
              stored.updatedAt = nowIso();
            }).then(() => {
              // Keep status as-is (e.g. warm_project). Opening the gate lets
              // the live Next process show its build-error overlay — the
              // pre-gate behavior. Do not set status "error" here: that would
              // trip isFailedRuntimeTraffic and replace the overlay with the
              // generic held page. Prewarm replacement still awaits this
              // same promise and rethrows into the outer catch, which sets
              // status "error" and stops the process; shouldHoldPrewarmTraffic
              // is checked first, so opening the gate is a no-op there.
              exposeRuntimeToClients(session, { restart, runtimePort, bootId: spawnedBootId });
              return appendRuntimeLog(
                session.previewSessionId,
                `Readiness failed (runtime process alive but page not ready): ${withTail}`,
              );
            });
          });
      } else {
        void readiness
          .then(() => {
            exposeRuntimeToClients(session, { restart: false, runtimePort, bootId: spawnedBootId });
            return appendRuntimeLog(
              session.previewSessionId,
              `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
            );
          })
          .catch((err) =>
            appendRuntimeLog(
              session.previewSessionId,
              `Readiness probe timed out but runtime is still running: ${err instanceof Error ? err.message : "unknown"}`,
            ),
          );
      }

      if (session.prewarmReplacementPending === true && !isPrewarm) {
        // A real version replacing a prewarm skeleton stays non-public until
        // the replacement itself answers readiness. Only this successful,
        // version-matched transition may clear the host-side traffic hold. If
        // readiness rejects (e.g. build-error overlay) this rethrows into the
        // outer catch, which sets status "error" and keeps the hold in place.
        await readiness;
        await updateSessionById(session.sessionId, (stored) => {
          if (stored.versionId !== session.versionId || stored.prewarm === true) return;
          stored.prewarmReplacementPending = false;
          stored.status = "warm_project";
          stored.runtimePort = runtimePort;
          stored.updatedAt = nowIso();
        });
      }

      return { runtimePort };
    };

    return await withNoSpaceCleanupRetry(runBoot, {
      onRetry: async () => {
        await appendRuntimeLog(
          session.previewSessionId,
          "Preview-host disk full; cleaning stale workspaces and retrying runtime boot once.",
        );
        const tracked = runtimeChildren.get(session.sessionId);
        if (tracked) {
          await stopRuntimeForSession(session);
        }
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const installDiagnostics =
      error && typeof error === "object" && error.installDiagnostics && typeof error.installDiagnostics === "object"
        ? error.installDiagnostics
        : null;
    // Count this strike from the STORE, inside the mutation. `session` is the
    // snapshot this boot started with, and install runs for minutes: a
    // same-version update resets the budget in that window because rewriting
    // content IS the repair. Classifying from the snapshot would write the
    // pre-reset strikes back and could reach the cap, after which the pre-boot
    // guard refuses the very boot the update asked for.
    let failure = { timestamps: [], failed: false };
    await updateSessionById(session.sessionId, (stored) => {
      if (stored.versionId !== session.versionId) return;
      failure = classifyRuntimeBootFailureLoop({
        timestamps: bootFailureTimestampsForSession(stored),
        now: Date.now(),
        record: true,
      });
      stored.status = "error";
      stored.runtimeBootFailureVersionId = session.versionId;
      stored.runtimeBootFailureTimestamps = failure.timestamps;
      // Install / postcondition / readiness failure is a hard boot failure —
      // mark readiness failed (unless prewarm) so `/status` reports it and the
      // app stamps preview_success=false + can trigger the repair path.
      if (session.prewarm !== true) {
        stored.readinessState = "failed";
        stored.readinessError = failure.failed
          ? [
              message,
              `Preview boot failed ${RUNTIME_BOOT_FAILURE_LIMIT} times within ${Math.round(RUNTIME_BOOT_FAILURE_WINDOW_MS / 1000)} seconds; further automatic retries are stopped.`,
            ].join("\n")
          : message;
        if (installDiagnostics) stored.installDiagnostics = installDiagnostics;
        else delete stored.installDiagnostics;
      }
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.previewSessionId,
      failure.failed
        ? `Runtime boot failed (retry cap reached): ${message}`
        : `Runtime boot failed: ${message}`,
    );
    const tracked = runtimeChildren.get(session.sessionId);
    if (tracked) {
      await stopRuntimeForSession(session);
    }
    throw error;
  }
}

/**
 * Injectable boot runner for the serialization guard tests
 * (`scripts/test-runtime-guards.mjs`). Production always uses the real
 * `bootRuntimeForSession`.
 */
let bootRunnerForChat = bootRuntimeForSession;

/**
 * Serialized per-chat boot (prod-incident 2026-07-03, chat e8420220):
 *
 * The previous implementation let a `restart: true` boot `await` the
 * in-flight boot and then run its own — but when SEVERAL restart boots
 * arrived while one was in flight, they ALL awaited the SAME promise and
 * were released in parallel once it settled. Two+ concurrent
 * `bootRuntimeForSession` calls for the same chat then raced
 * stop→resolvePort→spawn: two dev servers spawned (EADDRINUSE), the
 * later spawn overwrote `runtimeChildren`, and the earlier child leaked
 * as an orphan holding Next 16's workspace dev-lock — every subsequent
 * boot died with "Another next dev server is already running" until the
 * session hibernated with no working preview.
 *
 * Now every boot for a chat is CHAINED onto the previous one (strict
 * serialization), and restart boots coalesce: while a restart boot is
 * QUEUED (not yet started), further restart requests return that queued
 * boot — it re-reads the session from the store when it runs, so it
 * always boots the latest filesJson. This keeps the original guarantee
 * (a restart is never silently dropped) without ever running two boots
 * concurrently. Non-restart boots keep deduping to whatever is in
 * flight/queued.
 */
const bootChainByChat = new Map();
const queuedRestartBootByChat = new Map();

function ensureRuntimeForChat(chatId, options = {}) {
  const requestedRestart = options.restart === true;
  if (requestedRestart) {
    const queued = queuedRestartBootByChat.get(chatId);
    if (queued) return queued;
  } else {
    const existing = inflightBootByChat.get(chatId);
    if (existing) return existing;
  }
  const prevTail = bootChainByChat.get(chatId) ?? Promise.resolve();
  const run = prevTail
    .catch(() => undefined)
    .then(async () => {
      if (requestedRestart && queuedRestartBootByChat.get(chatId) === run) {
        // The boot is now RUNNING, not queued — a restart request arriving
        // from here on must queue a fresh boot (this one may already have
        // snapshotted pre-update files).
        queuedRestartBootByChat.delete(chatId);
      }
      const data = readStoreSync();
      const session = findSessionByChatId(data, chatId);
      if (!session) return null;
      const hadTrackedRuntime = runtimeChildren.has(session.sessionId);
      const hadAssignedPort =
        Number.isFinite(Number(session.runtimePort)) && Number(session.runtimePort) > 0;
      // A host-process restart loses runtimeChildren/inflight state but keeps
      // the session and assigned port in the store. That is a runtime swap for
      // any browser document which survived/reconnected, even though callers
      // correctly ask only to "ensure" the runtime. A genuinely fresh session
      // has no assigned port and remains a quiet first boot.
      const recoveringPersistedRuntime =
        !requestedRestart && !hadTrackedRuntime && hadAssignedPort;
      const runtimeSwap = requestedRestart || recoveringPersistedRuntime;
      if (runtimeSwap) {
        // SM-044: stop the old process first so a document reload cannot mix
        // HTML from the dying runtime with JS from the next one, then tell any
        // still-open iframe (HMR stub or reconnect) to reload. Missing filesJson
        // lets bootRuntimeForSession throw without killing a healthy preview.
        const canReplaceRuntime =
          session.filesJson && typeof session.filesJson === "object";
        if (canReplaceRuntime) {
          // Open HMR sockets are the common case, but the iframe can still be
          // showing the old document while the socket is mid-reconnect (HMR
          // proxy tears it down with the dying Next process). A tracked child
          // or an assigned runtimePort means this is a swap, not a fresh boot
          // — mark pending so a late registerPreviewSocket still gets reloadPage.
          const openViewerCount = activePreviewSocketCount(chatId);
          const openClient = openViewerCount > 0;
          const shouldSignalClient = openClient || hadTrackedRuntime || hadAssignedPort;
          if (shouldSignalClient) {
            // Open a viewer-keyed generation before stopRuntimeForSession can
            // make proxied sockets disappear. A persisted port is enough for
            // cold recovery: any surviving viewer that reconnects later is
            // identified through the iframe URL / WS Referer contract.
            markPendingPreviewClientReload(chatId);
          }
          await stopRuntimeForSession(session);
          if (shouldSignalClient) {
            const signaled = requestPreviewClientReload(chatId);
            await appendRuntimeLog(
              session.previewSessionId,
              signaled.sent > 0
                ? `Signaled preview client reload after runtime stop (${signaled.sent} open socket(s)).`
                : "Runtime stopped under an open preview; reload pending until HMR reconnects.",
            );
          }
        }
      }
      const result = await bootRunnerForChat(session, {
        ...options,
        restart: runtimeSwap,
      });
      return { session, runtimePort: result.runtimePort };
    });
  const tail = run.catch(() => undefined);
  bootChainByChat.set(chatId, tail);
  inflightBootByChat.set(chatId, run);
  if (requestedRestart) queuedRestartBootByChat.set(chatId, run);
  tail.then(() => {
    if (inflightBootByChat.get(chatId) === run) {
      inflightBootByChat.delete(chatId);
    }
    if (queuedRestartBootByChat.get(chatId) === run) {
      queuedRestartBootByChat.delete(chatId);
    }
    if (bootChainByChat.get(chatId) === tail) {
      bootChainByChat.delete(chatId);
    }
  });
  return run;
}

function queueRuntimeBoot(chatId, options = {}) {
  void ensureRuntimeForChat(chatId, options).catch(() => {
    // Failure is already written into session/log state by bootRuntimeForSession.
  });
}

function getRuntimeStateForChat(chatId) {
  const session = findSessionByChatId(readStoreSync(), chatId);
  if (!session) {
    return {
      session: null,
      running: false,
      booting: false,
      persistedStarting: false,
      acceptingTraffic: false,
      runtimePort: null,
      lastActivityAt: null,
    };
  }
  const tracked = runtimeChildren.get(session.sessionId);
  const running = Boolean(tracked && tracked.child.exitCode === null);
  // `status:"starting"` is persisted and may survive a host restart; it is not
  // proof that this process owns a live boot. Only the in-memory boot chain is.
  const booting = inflightBootByChat.has(chatId);
  return {
    session,
    running,
    booting,
    persistedStarting: session.status === "starting",
    acceptingTraffic: Boolean(running && tracked && tracked.acceptingTraffic !== false),
    runtimePort: tracked?.port ?? (Number.isFinite(Number(session.runtimePort)) ? Number(session.runtimePort) : null),
    lastActivityAt: Number.isFinite(tracked?.lastActivityAt) ? tracked.lastActivityAt : null,
  };
}

async function hibernateChatRuntime(chatId) {
  const data = readStoreSync();
  const session = findSessionByChatId(data, chatId);
  if (!session) return null;
  await stopRuntimeForSession(session);
  return session;
}

/**
 * Idle-reaper (M#fly1): stoppa dev-runtimes som varken fått proxytrafik eller
 * har en öppen preview-socket (≈ öppen iframe) på RUNTIME_IDLE_STOP_MS.
 * Sessionen markeras `hibernated` — samma vilotillstånd som klientens
 * hibernate-anrop — så att status-pollningen INTE auto-bootar om den; nästa
 * riktiga preview-besök väcker den via den vanliga startsidan i proxyn.
 */
async function sweepIdleRuntimes(nowMs = Date.now()) {
  if (!(RUNTIME_IDLE_STOP_MS > 0)) return { stoppedRuntimes: 0 };
  let stoppedRuntimes = 0;
  for (const [sessionId, tracked] of [...runtimeChildren.entries()]) {
    const chatId = typeof tracked.chatId === "string" ? tracked.chatId : "";
    if (chatId && inflightBootByChat.has(chatId)) continue;
    if (chatId && activeVerifyChatKeys.has(safeChatKey(chatId))) continue;
    if (chatId && activePreviewSocketCount(chatId) > 0) continue;
    const session = chatId ? findSessionByChatId(readStoreSync(), chatId) : null;
    if (
      session?.readinessState === "starting" &&
      tracked.child &&
      tracked.child.exitCode === null
    ) {
      continue;
    }
    const lastActivityAt = Number.isFinite(tracked.lastActivityAt)
      ? tracked.lastActivityAt
      : 0;
    if (nowMs - lastActivityAt < RUNTIME_IDLE_STOP_MS) continue;

    const previewSessionId =
      typeof tracked.previewSessionId === "string" && tracked.previewSessionId.trim()
        ? tracked.previewSessionId.trim()
        : null;
    // Markera `hibernated` FÖRE stoppet (Codex P2): stopTrackedRuntime tar
    // bort runtimen ur runtimeChildren och drainar upp till RUNTIME_DRAIN_MS —
    // i det fönstret skulle en status-poll annars se running=false med status
    // `warm_project` och auto-boota om runtimen, vilket besegrar reapern.
    // Status-routen auto-bootar aldrig `hibernated`-sessioner.
    // Saknas session-posten (städad store) är runtimen en orphan — stoppa den
    // ändå; status-skrivningen är bara relevant när posten finns.
    await updateSessionById(sessionId, (stored) => {
      stored.status = "hibernated";
      stored.lastAction = "idle_stop";
      stored.updatedAt = nowIso();
    }).catch(() => null);
    const stopped = await stopTrackedRuntime(sessionId, null).catch(() => false);
    if (!stopped) {
      // Runtimen försvann samtidigt (annan stop-väg). `hibernated` är ändå
      // rätt vilotillstånd för en idle runtime utan process, så lämna kvar.
      continue;
    }
    stoppedRuntimes += 1;
    if (previewSessionId) {
      await appendRuntimeLog(
        previewSessionId,
        `Runtime idle-stopped after ${Math.round(RUNTIME_IDLE_STOP_MS / 60000)} min without preview traffic; next visit boots it again.`,
      ).catch(() => {});
    }
  }
  return { stoppedRuntimes };
}

function createFakeRuntimeChildForTesting() {
  // Must be stoppable on POSIX. `stopChildProcessTree` signals first, then
  // waits for `close`. A plain `{ exitCode: null }` throws on Linux
  // (`child.kill is not a function`) so the idle reaper counts 0 — Windows
  // hides this because it uses taskkill and only waits for that helper.
  // Emit `close` asynchronously: the production stop path registers the
  // listener after kill(), matching a real child_process.
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.kill = () => {
    if (child.exitCode !== null) return;
    child.killed = true;
    child.exitCode = 1;
    queueMicrotask(() => child.emit("close", 1, null));
  };
  return child;
}

function setRuntimeStateForTesting(params) {
  const sessionId = params.sessionId;
  if (params.running) {
    runtimeChildren.set(sessionId, {
      child: createFakeRuntimeChildForTesting(),
      port: params.runtimePort,
      chatId: params.chatId,
      previewSessionId: params.previewSessionId ?? "",
      workspaceDir: params.workspaceDir ?? null,
      recentOutput: Array.isArray(params.recentOutput) ? params.recentOutput : [],
      lastActivityAt: Number.isFinite(params.lastActivityAt) ? params.lastActivityAt : Date.now(),
      acceptingTraffic: params.acceptingTraffic !== false,
      bootId: Number.isFinite(params.bootId) ? params.bootId : nextRuntimeBootId++,
    });
  } else {
    runtimeChildren.delete(sessionId);
  }
  if (params.booting) {
    inflightBootByChat.set(params.chatId, new Promise(() => {}));
  } else {
    inflightBootByChat.delete(params.chatId);
  }
}

function clearRuntimeStateForTesting(chatId, sessionId) {
  runtimeChildren.delete(sessionId);
  inflightBootByChat.delete(chatId);
  bootChainByChat.delete(chatId);
  queuedRestartBootByChat.delete(chatId);
}

function setBootRunnerForTesting(runner) {
  bootRunnerForChat = runner ?? bootRuntimeForSession;
}

module.exports = {
  probeReadinessAfterPatch,
  applyRuntimePatch,
  classifyRuntimeCleanExitLoop,
  RUNTIME_CLEAN_EXIT_LIMIT,
  RUNTIME_CLEAN_EXIT_WINDOW_MS,
  classifyRuntimeBootFailureLoop,
  RUNTIME_BOOT_FAILURE_LIMIT,
  RUNTIME_BOOT_FAILURE_WINDOW_MS,
  htmlLooksLikeBuildError,
  waitForReady,
  exposeRuntimeToClients,
  clearStaleNextDevLock,
  stopTrackedRuntime,
  stopRuntimeForSession,
  bootRuntimeForSession,
  ensureRuntimeForChat,
  queueRuntimeBoot,
  getRuntimeStateForChat,
  hibernateChatRuntime,
  sweepIdleRuntimes,
  setRuntimeStateForTesting,
  createFakeRuntimeChildForTesting,
  clearRuntimeStateForTesting,
  setBootRunnerForTesting,
};
