"use strict";

// Processlivscykel: boot/restart-serialisering, dev-server-spawn, readiness,
// Fast Edit Lane-patchning av live-runtimen, hibernate och idle-reaper.
// Ren extraktion ur runtime.js — ingen beteendeändring.

const { spawn } = require("node:child_process");

const { readStoreSync } = require("./../store.js");
const {
  LOOPBACK,
  activePreviewSocketCount,
  activeVerifyChatKeys,
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

const READINESS_MAX_MS = parseInt(process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS ?? "180000", 10);
const READINESS_INTERVAL_MS = 1200;
const READINESS_EMPTY_BODY_MIN_CHARS = 50;
const READINESS_MAX_EMPTY_BODY_RETRIES = 5;
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

function classifyRuntimeCleanExitLoop({ timestamps, now = Date.now() }) {
  const recent = (Array.isArray(timestamps) ? timestamps : [])
    .filter((value) => Number.isFinite(value) && now - value <= RUNTIME_CLEAN_EXIT_WINDOW_MS)
    .concat(now);
  return {
    timestamps: recent,
    failed: recent.length >= RUNTIME_CLEAN_EXIT_LIMIT,
  };
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

async function waitForReady(url) {
  const deadline = Date.now() + READINESS_MAX_MS;
  let lastError = "";
  let emptyBodyStreak = 0;
  let buildErrorStreak = 0;
  let lastBuildErrorMessage = "";
  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      });
      if (!responseHeadersLookLikeHtmlDocument(res)) {
        emptyBodyStreak = 0;
        buildErrorStreak = 0;
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
        emptyBodyStreak = 0;
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
      if (htmlBodyHasMeaningfulVisibleText(text)) {
        return;
      }
      emptyBodyStreak += 1;
      lastError = "HTTP 200 HTML but body text still empty (compiling or blank page)";
      if (emptyBodyStreak >= READINESS_MAX_EMPTY_BODY_RETRIES) {
        console.warn(
          `[preview-host] Readiness: HTML body still looks empty after ${READINESS_MAX_EMPTY_BODY_RETRIES} attempts; accepting response.`,
        );
        return;
      }
    } catch (err) {
      // A thrown build-error-overlay verdict is terminal — propagate it rather
      // than treating it like a transient fetch error and looping to timeout.
      if (err instanceof Error && /build error overlay/i.test(err.message)) {
        throw err;
      }
      emptyBodyStreak = 0;
      buildErrorStreak = 0;
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(tid);
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
  throw new Error(`Runtime did not become ready within ${READINESS_MAX_MS}ms. Last error: ${lastError}`);
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

async function stopTrackedRuntime(sessionId, previewSessionId = null) {
  const tracked = runtimeChildren.get(sessionId);
  if (!tracked) return false;
  runtimeChildren.delete(sessionId);
  tracked.ignoreExit = true;
  await stopChildProcessTree(tracked.child);
  if (previewSessionId) {
    await appendRuntimeLog(previewSessionId, "Runtime stopped.");
  }
  return true;
}

async function stopRuntimeForSession(session) {
  await stopTrackedRuntime(session.sessionId, session.previewSessionId);
}

async function spawnDevServer(session, workspaceDir, runtimePort) {
  // Defense-in-depth (prod-incident 2026-07-03): never overwrite a live
  // tracked child. `runtimeChildren.set` below would orphan the previous
  // process, which keeps holding Next 16's workspace dev-lock and kills every
  // later boot with "Another next dev server is already running". Boots are
  // serialized per chat, so this is normally a no-op — it only fires if a
  // prior child survived an aborted/raced boot path.
  await stopTrackedRuntime(session.sessionId, null);
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

      await updateSessionById(session.sessionId, (stored) => {
        if (stored.versionId !== session.versionId) return;
        stored.status = "warm_project";
        stored.runtimePort = runtimePort;
        stored.updatedAt = nowIso();
        // Readiness is not yet confirmed (page not proven build-error-free).
        // Prewarm skeletons keep today's stateless behaviour.
        if (!isPrewarm) {
          stored.readinessState = "starting";
          stored.readinessError = null;
        }
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
              stored.readinessState = "ready";
              stored.readinessError = null;
              stored.updatedAt = nowIso();
            }),
          )
          .then(() =>
            appendRuntimeLog(
              session.previewSessionId,
              `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
            ),
          )
          .catch((err) => {
            const message = err instanceof Error ? err.message : "unknown readiness failure";
            return updateSessionById(session.sessionId, (stored) => {
              if (stored.versionId !== session.versionId) return;
              stored.readinessState = "failed";
              stored.readinessError = message;
              stored.updatedAt = nowIso();
            }).then(() =>
              appendRuntimeLog(
                session.previewSessionId,
                `Readiness failed (runtime process alive but page not ready): ${message}`,
              ),
            );
          });
      } else {
        void readiness
          .then(() =>
            appendRuntimeLog(
              session.previewSessionId,
              `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
            ),
          )
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
    await updateSessionById(session.sessionId, (stored) => {
      if (stored.versionId !== session.versionId) return;
      stored.status = "error";
      // Install / postcondition / readiness failure is a hard boot failure —
      // mark readiness failed (unless prewarm) so `/status` reports it and the
      // app stamps preview_success=false + can trigger the repair path.
      if (session.prewarm !== true) {
        stored.readinessState = "failed";
        stored.readinessError = message;
      }
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.previewSessionId,
      `Runtime boot failed: ${message}`,
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
  const restart = options.restart === true;
  if (restart) {
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
      if (restart && queuedRestartBootByChat.get(chatId) === run) {
        // The boot is now RUNNING, not queued — a restart request arriving
        // from here on must queue a fresh boot (this one may already have
        // snapshotted pre-update files).
        queuedRestartBootByChat.delete(chatId);
      }
      const data = readStoreSync();
      const session = findSessionByChatId(data, chatId);
      if (!session) return null;
      const result = await bootRunnerForChat(session, options);
      return { session, runtimePort: result.runtimePort };
    });
  const tail = run.catch(() => undefined);
  bootChainByChat.set(chatId, tail);
  inflightBootByChat.set(chatId, run);
  if (restart) queuedRestartBootByChat.set(chatId, run);
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
      runtimePort: null,
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
    runtimePort: tracked?.port ?? (Number.isFinite(Number(session.runtimePort)) ? Number(session.runtimePort) : null),
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

function setRuntimeStateForTesting(params) {
  const sessionId = params.sessionId;
  if (params.running) {
    runtimeChildren.set(sessionId, {
      child: { exitCode: null },
      port: params.runtimePort,
      chatId: params.chatId,
      previewSessionId: params.previewSessionId ?? "",
      lastActivityAt: Date.now(),
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
  htmlLooksLikeBuildError,
  waitForReady,
  stopTrackedRuntime,
  stopRuntimeForSession,
  bootRuntimeForSession,
  ensureRuntimeForChat,
  queueRuntimeBoot,
  getRuntimeStateForChat,
  hibernateChatRuntime,
  sweepIdleRuntimes,
  setRuntimeStateForTesting,
  clearRuntimeStateForTesting,
  setBootRunnerForTesting,
};
