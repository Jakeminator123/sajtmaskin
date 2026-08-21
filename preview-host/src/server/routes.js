'use strict';

const { URL } = require("node:url");
const { randomUUID } = require("node:crypto");
const {
  readStoreSync,
  withStoreLock,
} = require("../store.js");
const {
  applyRuntimePatch,
  probeReadinessAfterPatch,
  buildPreviewUrl,
  cleanupPackageCaches,
  cleanupPreviewHostStorage,
  destroyChatWorkspace,
  findSessionByChatId,
  getRuntimeStateForChat,
  getSessionChatId,
  hibernateChatRuntime,
  listSessions,
  proxyPreviewRequest,
  queueRuntimeBoot,
  runQueuedVerifyJob,
  stopRuntimeForSession,
} = require("../runtime.js");
const {
  validateStartPayload,
  validateUpdatePayload,
  validatePatchPayload,
  validateSessionRefPayload,
  validateVerifyPayload,
} = require("../validate.js");
const {
  acquirePrewarmLease,
  pruneExpiredPrewarmLeases,
  releasePrewarmLeaseForChat,
  resetPrewarmLeases,
} = require("../prewarm-leases.js");
const { sendRootPlaceholderSvg } = require("../placeholder-svg.js");
const { PREVIEW_BASE_URL, PREWARM_LEASE_MS } = require("./config.js");
const {
  json,
  notFound,
  readJsonBody,
  nowIso,
  checkApiKey,
  applyPublicPreviewHeaders,
} = require("./http.js");
const {
  sessionExpiresAtIso,
  sessionResponse,
  appendLog,
  findSessionById,
  findSessionByPreviewSessionId,
  isSessionUsable,
  getPreviewStatusSessionId,
  getPreviewFilesManifestSessionId,
  buildSessionFilesManifest,
} = require("./sessions.js");
const {
  maybeRunOpportunisticCleanup,
  describeStorageState,
} = require("./storage.js");

async function routeRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const data = readStoreSync();
    return json(res, 200, {
      ok: true,
      service: "preview-host",
      ts: nowIso(),
      sessions: Object.keys(data.sessions).length,
    });
  }

  if (req.method === "GET" && url.pathname === "/placeholder.svg") {
    sendRootPlaceholderSvg(res, url);
    return undefined;
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "preview-host",
      mode: "runtime",
      endpoints: [
        "GET /health",
        "POST /preview/session/start",
        "POST /preview/session/update",
        "POST /preview/session/patch",
        "POST /preview/session/hibernate",
        "POST /preview/session/destroy",
        "POST /preview/verify",
        "GET /preview/session/:id",
        "GET /preview/session/:previewSessionId/status",
        "GET /preview/session/:previewSessionId/files-manifest",
        "GET /preview/sandbox/:previewSessionId/status (legacy path)",
        "GET /preview/logs/:previewSessionId",
        "GET /admin/sessions",
        "GET /admin/storage",
        "POST /admin/cleanup",
        "POST /admin/destroy-all",
        "GET /placeholder.svg",
        "GET /:chatId/*",
      ],
    });
  }

  if (
    !url.pathname.startsWith("/preview/") &&
    url.pathname !== "/" &&
    url.pathname !== "/health"
  ) {
    applyPublicPreviewHeaders(res);
    const proxied = await proxyPreviewRequest(req, res, url.pathname, url.search);
    if (proxied) {
      return undefined;
    }
  }

  const needsAuth = url.pathname.startsWith("/preview/");
  if (needsAuth && !checkApiKey(req, res)) {
    return undefined;
  }

  const previewStatusSessionId = getPreviewStatusSessionId(url.pathname);
  if (req.method === "GET" && previewStatusSessionId) {
    const previewSessionId = previewStatusSessionId;
    if (!previewSessionId) {
      return json(res, 400, { error: "bad_request", message: "Missing previewSessionId." });
    }
    const statusResult = await withStoreLock((data) => {
      const nowMs = Date.now();
      const session = findSessionByPreviewSessionId(data, previewSessionId);
      if (!session || !isSessionUsable(session, nowMs)) {
        return { type: "missing" };
      }
      return {
        type: "ok",
        session,
      };
    });
    if (statusResult.type === "missing") {
      return json(res, 404, {
        error: "session_not_found",
        message: "No active preview session for this previewSessionId.",
      });
    }
    const chatId = getSessionChatId(statusResult.session);
    const runtimeState = getRuntimeStateForChat(chatId);
    if (
      !runtimeState.running &&
      !runtimeState.booting &&
      statusResult.session.status !== "error" &&
      statusResult.session.status !== "hibernated"
    ) {
      queueRuntimeBoot(chatId);
    }
    const latest = findSessionByPreviewSessionId(readStoreSync(), previewSessionId) ?? statusResult.session;
    const publicRunning =
      runtimeState.running &&
      latest.prewarm !== true &&
      latest.prewarmReplacementPending !== true;
    // Readiness ≠ process running. `running` stays process-liveness (legacy
    // contract), but `httpReady` means the page actually answered without a
    // Next build-error overlay / HTTP 500 (host `waitForReady` verdict recorded
    // as `readinessState`). The app keys `preview_success` off `httpReady` /
    // `readinessState`, not mere liveness. Prewarm skeletons have no readiness
    // state → report ready when running so their status is unchanged.
    const readinessState =
      typeof latest.readinessState === "string" ? latest.readinessState : null;
    const httpReady =
      publicRunning && (latest.prewarm === true || readinessState === "ready");
    return json(res, 200, {
      ok: true,
      running: publicRunning,
      httpReady,
      readinessState,
      readinessError:
        typeof latest.readinessError === "string" ? latest.readinessError : null,
      ...(latest.installDiagnostics && typeof latest.installDiagnostics === "object"
        ? { installDiagnostics: latest.installDiagnostics }
        : {}),
      previewSessionId: latest.previewSessionId,
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: latest.previewSessionId,
      previewUrl: latest.previewUrl,
      versionId: latest.versionId,
      status: latest.status,
      sessionExpiresAt: latest.sessionExpiresAt,
      // One-shot lockfile round-trip: after a stale-lockfile reconcile the host
      // returns the regenerated lockfile so the app can persist it into the
      // version files and clear the stale marker.
      ...(latest.regeneratedLockfile &&
      typeof latest.regeneratedLockfile.path === "string" &&
      typeof latest.regeneratedLockfile.content === "string"
        ? { regeneratedLockfile: latest.regeneratedLockfile }
        : {}),
    });
  }

  const filesManifestSessionId = getPreviewFilesManifestSessionId(url.pathname);
  if (req.method === "GET" && filesManifestSessionId) {
    // Read-only by design: unlike `/status` this never queues a boot, so the
    // app can ask "what is live right now?" without changing runtime state.
    const session = findSessionByPreviewSessionId(readStoreSync(), filesManifestSessionId);
    if (!session || !isSessionUsable(session, Date.now())) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No active preview session for this previewSessionId.",
      });
    }
    const runtimeState = getRuntimeStateForChat(getSessionChatId(session));
    const files = buildSessionFilesManifest(session);
    return json(res, 200, {
      ok: true,
      previewSessionId: session.previewSessionId,
      chatId: getSessionChatId(session),
      versionId: session.versionId,
      status: session.status,
      // Same public-running rule as `/status`: a prewarm skeleton (or a session
      // whose real replacement has not passed readiness yet) is never reported
      // as running, so the app cannot patch a skeleton workspace.
      running:
        runtimeState.running &&
        session.prewarm !== true &&
        session.prewarmReplacementPending !== true,
      hashAlgorithm: "sha256",
      fileCount: Object.keys(files).length,
      files,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/start") {
    const raw = await readJsonBody(req);
    const validated = validateStartPayload(raw);
    await maybeRunOpportunisticCleanup();
    const created = await withStoreLock((data) => {
      const nowMs = Date.now();
      const existing = findSessionByChatId(data, validated.chatId);
      if (validated.prewarm) {
        // A delayed best-effort request must never take over a real finalized
        // session. This check and the mutation live under the host's persistent
        // store lock, so process-local app dedup is not relied on for safety.
        if (existing && existing.prewarm !== true) {
          return { type: "prewarm_superseded", session: existing };
        }
        if (existing) {
          // Re-establish the subject lease before recovering a persisted/dead
          // prewarm. Boot failure deliberately releases it, so idempotent
          // retries must not become an unmetered install loop.
          const reacquired = acquirePrewarmLease(data, {
            key: validated.prewarmLeaseKey,
            chatId: validated.chatId,
            nowMs,
            leaseMs: PREWARM_LEASE_MS,
          });
          if (reacquired.type === "rate_limited") {
            return { type: "prewarm_rate_limited", lease: reacquired.lease };
          }
          if (reacquired.type === "capacity") {
            return { type: "prewarm_capacity" };
          }
          // Keep exactly one active key for the chat if its canonical subject
          // changed (for example guest -> authenticated user).
          releasePrewarmLeaseForChat(data, validated.chatId);
          data.prewarmLeases[reacquired.key] = reacquired.lease;
          return { type: "prewarm_idempotent", session: existing };
        }
        const acquired = acquirePrewarmLease(data, {
          key: validated.prewarmLeaseKey,
          chatId: validated.chatId,
          nowMs,
          leaseMs: PREWARM_LEASE_MS,
        });
        if (acquired.type === "rate_limited") {
          return { type: "prewarm_rate_limited", lease: acquired.lease };
        }
        if (acquired.type === "capacity") {
          return { type: "prewarm_capacity" };
        }
      } else {
        pruneExpiredPrewarmLeases(data, nowMs);
        releasePrewarmLeaseForChat(data, validated.chatId);
      }
      const prewarmReplacementPending =
        !validated.prewarm &&
        (existing?.prewarm === true || existing?.prewarmReplacementPending === true);
      const createdAt = existing?.createdAt ?? nowIso();
      const updatedAt = nowIso();
      const sessionExpiresAt = sessionExpiresAtIso();
      const sessionId = existing?.sessionId ?? randomUUID();
      const previewSessionId = existing?.previewSessionId ?? `ps_${randomUUID()}`;
      const session = {
        sessionId,
        previewSessionId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        previewUrl: buildPreviewUrl(PREVIEW_BASE_URL, validated.chatId),
        status: "starting",
        lastAction: "start",
        changeClass: validated.changeClass,
        startOutcome: existing ? "resumed" : "fresh",
        preferredBaseImage: validated.preferredBaseImage,
        dependencyFingerprint: validated.dependencyFingerprint,
        resumeStrategy: validated.resumeStrategy,
        filesJson: validated.filesJson,
        prewarm: validated.prewarm,
        prewarmReplacementPending,
        createdAt,
        updatedAt,
        sessionExpiresAt,
        runtimePort: existing?.runtimePort ?? null,
      };
      data.sessions[sessionId] = session;
      data.previewSessionToSession[previewSessionId] = sessionId;
      appendLog(
        data,
        previewSessionId,
        existing
          ? `Session reused for chat ${validated.chatId}; booting updated runtime.`
          : `Session created for chat ${validated.chatId}.`,
      );
      return { type: "created", session };
    });
    if (created.type === "prewarm_superseded") {
      return json(res, 409, {
        error: "prewarm_superseded",
        message: "A finalized preview version already owns this chat session.",
        versionId: created.session.versionId,
      });
    }
    if (created.type === "prewarm_rate_limited") {
      return json(res, 429, {
        error: "prewarm_rate_limited",
        message: "A prewarm lease is already active for this generation subject.",
        retryAt: created.lease.expiresAt,
      });
    }
    if (created.type === "prewarm_capacity") {
      return json(res, 429, {
        error: "prewarm_rate_limited",
        message: "Preview-host prewarm capacity is currently exhausted.",
      });
    }
    if (created.type === "prewarm_idempotent") {
      // A persisted prewarm may outlive the host process that started it.
      // Recover only a missing/dead runtime. A healthy prewarm (or one already
      // booting) must not be restarted by an idempotent app retry.
      const runtimeState = getRuntimeStateForChat(validated.chatId);
      if (!runtimeState.running && !runtimeState.booting) {
        queueRuntimeBoot(validated.chatId, { restart: true });
      }
      return json(res, 200, sessionResponse(created.session));
    }
    queueRuntimeBoot(validated.chatId, { restart: true });
    return json(
      res,
      201,
      sessionResponse(findSessionById(readStoreSync(), created.session.sessionId) ?? created.session),
    );
  }

  if (req.method === "POST" && url.pathname === "/preview/session/update") {
    const raw = await readJsonBody(req);
    const validated = validateUpdatePayload(raw);
    const updated = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return null;
      }
      if (!isSessionUsable(session, Date.now())) {
        return null;
      }
      const replacingPrewarm =
        session.prewarm === true || session.prewarmReplacementPending === true;
      session.versionId = validated.versionId;
      session.prewarm = false;
      session.prewarmReplacementPending = replacingPrewarm;
      releasePrewarmLeaseForChat(data, getSessionChatId(session));
      session.changeClass = validated.changeClass;
      if (validated.filesJson !== undefined) {
        session.filesJson = validated.replaceFiles
          ? validated.filesJson
          : {
              ...(session.filesJson && typeof session.filesJson === "object" ? session.filesJson : {}),
              ...validated.filesJson,
            };
      }
      session.status = replacingPrewarm ? "starting" : "warm_project";
      // Atomic with the version advance, in the same store-lock mutation (same
      // rule as /patch): readiness is a per-version verdict. Keeping the old one
      // would let /status answer "ready" for files this runtime has not compiled
      // yet, and would let a version that failed once drag its error message
      // onto its successor. The queued restart writes "starting" as well, but
      // only after install/spawn — until then the previous boot's verdict is
      // what the app reads.
      if (!replacingPrewarm) {
        session.readinessState = "starting";
        session.readinessError = null;
      }
      // An explicit update is a new boot attempt even when the caller rewrites
      // the same version id (for example after the files revision advances in
      // place). Reset the clean-exit budget here, atomically with the content
      // mutation. The runtime cannot infer this from `status`: normal updates
      // intentionally use `warm_project` while their workspace is prepared.
      session.runtimeCleanExitVersionId = validated.versionId;
      session.runtimeCleanExitTimestamps = [];
      // Same reasoning for the install/boot-failure budget: rewriting content
      // IS the repair, so a capped session must get a fresh budget or the
      // pre-boot guard would refuse the very boot that would have succeeded.
      session.runtimeBootFailureVersionId = validated.versionId;
      session.runtimeBootFailureTimestamps = [];
      session.lastAction = "update";
      session.startOutcome = "resumed";
      session.updatedAt = nowIso();
      session.sessionExpiresAt = sessionExpiresAtIso();
      appendLog(data, session.previewSessionId, `Session updated with changeClass=${session.changeClass}.`);
      return session;
    });
    if (!updated) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    queueRuntimeBoot(getSessionChatId(updated), { restart: true });
    return json(res, 200, sessionResponse(findSessionById(readStoreSync(), updated.sessionId) ?? updated));
  }

  if (req.method === "POST" && url.pathname === "/preview/session/patch") {
    const raw = await readJsonBody(req);
    const validated = validatePatchPayload(raw);
    const patchOutcome = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return { type: "missing" };
      }
      if (!isSessionUsable(session, Date.now())) {
        return { type: "missing" };
      }
      // Finding #2 (FEL-3): re-check the expected base under the store lock.
      // The app does an optimistic precheck, but two near-simultaneous quick
      // edits derived from the same base can both pass it before the host
      // advances the session. Re-checking here — atomically with the mutation —
      // closes that TOCTOU window: if the live session no longer points at the
      // base the patch was derived from, refuse the merge (without mutating) so
      // the caller does a full (re)start instead of writing a hybrid file set.
      //
      // STRICT equality, not "differs from": a session with NO version at all
      // (prewarm skeleton, a store row written by an older host build, a
      // rolled-back patch) is not evidence that the base matches — it is
      // evidence that we do not know what is live. Merging a partial diff into
      // an unknown workspace is exactly the hybrid-file-set failure this check
      // exists to prevent, so a missing version is refused with the same 409.
      if (validated.expectedBaseVersionId) {
        const liveVersionId =
          typeof session.versionId === "string" ? session.versionId.trim() : "";
        if (!liveVersionId || liveVersionId !== validated.expectedBaseVersionId) {
          return { type: "base_mismatch", currentVersionId: liveVersionId || null };
        }
      }
      // Finding #3 (FEL-5): snapshot the fields we are about to advance so a
      // failed workspace write (e.g. ENOSPC in the hot-patch path) can be rolled
      // back. Otherwise the session would advertise a new versionId/filesJson
      // that never actually landed on disk -> false-green stale preview.
      const rollback = {
        versionId: session.versionId,
        filesJson: session.filesJson,
        status: session.status,
        lastAction: session.lastAction,
        startOutcome: session.startOutcome,
        changeClass: session.changeClass,
        updatedAt: session.updatedAt,
        sessionExpiresAt: session.sessionExpiresAt,
        // Readiness belongs in the snapshot for the same reason versionId does:
        // it describes a version, and this mutation advances the version.
        readinessState: session.readinessState,
        readinessError: session.readinessError,
      };
      const replacingPrewarm =
        session.prewarm === true || session.prewarmReplacementPending === true;
      session.versionId = validated.versionId;
      session.prewarm = false;
      session.prewarmReplacementPending = replacingPrewarm;
      releasePrewarmLeaseForChat(data, getSessionChatId(session));
      // Merge the changed files into the stored set and apply removals so a
      // later full boot reflects the patch. This mirrors update's
      // replaceFiles:false merge but only for the changed paths.
      const base =
        session.filesJson && typeof session.filesJson === "object"
          ? { ...session.filesJson }
          : {};
      for (const [relPath, content] of Object.entries(validated.files)) {
        base[relPath] = content;
      }
      for (const relPath of validated.removedPaths) {
        delete base[relPath];
      }
      session.filesJson = base;
      session.status = replacingPrewarm ? "starting" : "warm_project";
      // Atomic with the version advance, in the same store-lock mutation: the
      // readiness verdict on the session describes the OLD version's boot, and
      // keeping it would let the app read "ready" for files Next has not even
      // compiled yet. Clearing the old error at the same time means a version
      // that failed once does not drag its message onto its successor. The
      // probe kicked off after the workspace write resolves it.
      if (!replacingPrewarm) {
        session.readinessState = "starting";
        session.readinessError = null;
      }
      session.lastAction = "patch";
      session.startOutcome = "resumed";
      session.changeClass = "light";
      session.updatedAt = nowIso();
      session.sessionExpiresAt = sessionExpiresAtIso();
      appendLog(
        data,
        session.previewSessionId,
        `Session patched (${Object.keys(validated.files).length} file(s), ${validated.removedPaths.length} removed).`,
      );
      return {
        type: "ok",
        sessionId: session.sessionId,
        previewSessionId: session.previewSessionId,
        chatId: getSessionChatId(session),
        replacingPrewarm,
        rollback,
      };
    });
    if (patchOutcome.type === "missing") {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    if (patchOutcome.type === "base_mismatch") {
      return json(res, 409, {
        error: "base_mismatch",
        message: patchOutcome.currentVersionId
          ? "Preview session has advanced past the expected base version; refusing partial patch."
          : "Preview session has no known version; refusing partial patch.",
        versionId: patchOutcome.currentVersionId,
      });
    }
    const patchResult = patchOutcome.replacingPrewarm
      ? (() => {
          queueRuntimeBoot(patchOutcome.chatId, { restart: true });
          return { mode: "restarted", reason: "prewarm_replacement" };
        })()
      : applyRuntimePatch(patchOutcome.chatId, {
          files: validated.files,
          removedPaths: validated.removedPaths,
        });
    if (patchResult.mode === "error") {
      // Finding #3 (FEL-5): the workspace patch did not land. Roll the session
      // back to its pre-patch snapshot so /status (and a later resume) never
      // reports the new version as live while the dev process still serves the
      // old files. Skip the rollback if another patch advanced the session past
      // ours in the meantime (don't clobber a newer successful write).
      await withStoreLock((data) => {
        const session = data.sessions[patchOutcome.sessionId];
        if (!session || session.versionId !== validated.versionId) {
          return session ?? null;
        }
        Object.assign(session, patchOutcome.rollback);
        appendLog(
          data,
          session.previewSessionId,
          `Patch rolled back; workspace write failed: ${patchResult.reason ?? "unknown error"}.`,
        );
        return session;
      });
      return json(res, 500, {
        error: "patch_failed",
        message: patchResult.reason ?? "Preview-host failed to apply the patch.",
      });
    }
    if (patchResult.mode === "patched") {
      // Hot patch = no boot, so nothing else would ever re-evaluate readiness
      // for the version we just pinned. Fire-and-forget (the response must not
      // wait out a 180s readiness deadline); every write inside is bound to
      // this exact version.
      void probeReadinessAfterPatch({
        chatId: patchOutcome.chatId,
        sessionId: patchOutcome.sessionId,
        previewSessionId: patchOutcome.previewSessionId,
        versionId: validated.versionId,
      });
    }
    const latest = findSessionById(readStoreSync(), patchOutcome.sessionId);
    if (!latest) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    return json(res, 200, {
      ...sessionResponse(latest),
      patchMode: patchResult.mode,
      patchReason: patchResult.reason ?? null,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/hibernate") {
    const raw = await readJsonBody(req);
    const validated = validateSessionRefPayload(raw);
    const out = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session || !isSessionUsable(session, Date.now())) {
        return null;
      }
      session.status = "hibernated";
      session.lastAction = "hibernate";
      session.updatedAt = nowIso();
      appendLog(data, session.previewSessionId, "Session hibernated.");
      return session;
    });
    if (!out) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    await hibernateChatRuntime(getSessionChatId(out));
    return json(res, 200, sessionResponse(out));
  }

  if (req.method === "POST" && url.pathname === "/preview/session/destroy") {
    const raw = await readJsonBody(req);
    const validated = validateSessionRefPayload(raw);
    const destroyed = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return null;
      }
      const chatId = getSessionChatId(session);
      const { sessionId, previewSessionId } = session;
      session.status = "destroyed";
      session.lastAction = "destroy";
      session.updatedAt = nowIso();
      appendLog(data, previewSessionId, "Session destroyed.");
      releasePrewarmLeaseForChat(data, chatId);
      delete data.sessions[sessionId];
      delete data.previewSessionToSession[previewSessionId];
      return { sessionId, previewSessionId, chatId };
    });
    if (!destroyed) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    await stopRuntimeForSession(destroyed);
    try {
      await destroyChatWorkspace(destroyed.chatId);
    } catch {
      // Best-effort cleanup only; the session is already destroyed.
    }
    return json(res, 200, {
      destroyed: true,
      sessionId: destroyed.sessionId,
      previewSessionId: destroyed.previewSessionId,
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: destroyed.previewSessionId,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/verify") {
    const raw = await readJsonBody(req);
    const validated = validateVerifyPayload(raw);
    const verifyId = `verify_${randomUUID()}`;
    try {
      const result = await runQueuedVerifyJob({
        verifyId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        filesJson: validated.filesJson,
        checks: validated.checks,
      });
      return json(res, 200, {
        ok: true,
        verifyId: result.verifyId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        durationMs: result.durationMs,
        jobStartedAt: result.jobStartedAt ?? null,
        jobFinishedAt: result.jobFinishedAt ?? null,
        firstFailureCheck: result.firstFailureCheck ?? null,
        results: result.results,
      });
    } catch (error) {
      return json(res, 500, {
        error: "verify_failed",
        message: error instanceof Error ? error.message : "Preview-host verify failed.",
        verifyId,
      });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/preview/session/")) {
    const sessionId = url.pathname.split("/").at(-1);
    if (!sessionId) {
      return notFound(res);
    }
    const data = readStoreSync();
    const session = findSessionById(data, sessionId);
    if (!session) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    return json(res, 200, sessionResponse(session));
  }

  if (req.method === "GET" && url.pathname.startsWith("/preview/logs/")) {
    const previewSessionId = url.pathname.split("/").at(-1);
    const data = readStoreSync();
    const logs = previewSessionId ? data.logs[previewSessionId] ?? [] : [];
    return json(res, 200, {
      previewSessionId: previewSessionId ?? "",
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: previewSessionId ?? "",
      lines: logs,
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/cleanup") {
    if (!checkApiKey(req, res)) return;
    try {
      // `?purgeCaches=1` drops the package cache regardless of its size. This
      // is the operator's escape hatch for a disk-full host: it reclaims the
      // one directory that ordinary cleanup deliberately keeps warm.
      const purgeCaches = url.searchParams.get("purgeCaches") === "1";
      const cachePurge = purgeCaches ? await cleanupPackageCaches({ force: true }) : null;
      const result = await cleanupPreviewHostStorage();
      return json(res, 200, {
        cleaned: true,
        ...result,
        ...(cachePurge
          ? {
              forcedCachePurge: true,
              forcedCachePurgeBytes: cachePurge.cacheBytesBefore,
            }
          : {}),
      });
    } catch (error) {
      return json(res, 500, {
        error: "cleanup_failed",
        message: error instanceof Error ? error.message : "Cleanup failed.",
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/admin/sessions") {
    if (!checkApiKey(req, res)) return;
    const sessions = listSessions(readStoreSync()).map((session) => sessionResponse(session));
    return json(res, 200, {
      count: sessions.length,
      sessions,
    });
  }

  if (req.method === "GET" && url.pathname === "/admin/storage") {
    if (!checkApiKey(req, res)) return;
    return json(res, 200, {
      ok: true,
      storage: await describeStorageState(),
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/destroy-all") {
    if (!checkApiKey(req, res)) return;
    const activeSessions = listSessions(readStoreSync());
    const destroyed = await withStoreLock((data) => {
      const toDestroy = [];
      for (const session of activeSessions) {
        const chatId = getSessionChatId(session);
        const { sessionId, previewSessionId } = session;
        delete data.sessions[sessionId];
        delete data.previewSessionToSession[previewSessionId];
        delete data.logs[previewSessionId];
        toDestroy.push({ sessionId, previewSessionId, chatId });
      }
      const resetLeases = resetPrewarmLeases(data);
      return { sessions: toDestroy, resetLeases };
    });
    for (const session of destroyed.sessions) {
      try {
        await stopRuntimeForSession(session);
      } catch {
        // best effort
      }
      try {
        await destroyChatWorkspace(session.chatId);
      } catch {
        // best effort
      }
    }
    return json(res, 200, {
      destroyed: destroyed.sessions.length,
      resetPrewarmLeases: destroyed.resetLeases,
      sessions: destroyed.sessions,
    });
  }

  return notFound(res);
}

module.exports = {
  routeRequest,
};
