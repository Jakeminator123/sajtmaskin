/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+preview verify handoff in the generation stream as a
 * fire-and-forget background task. Updates version verification state
 * on the DB; the UI reads server state via version polls.
 *
 * Note: this module uses preview-host's isolated verify lane. It does not
 * control the primary tier-2 preview provider for end users.
 *
 * Deduplicated: the same versionId will not run twice concurrently.
 */
import { dbConfigured } from "@/lib/db/client";
import {
  markVersionVerifying,
  markVersionRepairing,
  promoteVersion,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
  getLatestVersion,
  getPreferredVersion,
  markVersionSupersededByRepair,
  acquireVersionLease,
  releaseVersionLease,
  renewVersionLease,
  type VersionJobKind,
} from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { devLogAppend } from "@/lib/logging/devLog";
import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import { warnLog } from "@/lib/utils/debug";
import {
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "@/lib/gen/scaffolds/protected-paths";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import {
  isTypecheckOnlyAdvisory,
  resolvePostRepairGateChecks,
  resolveSameSignalGateChecks,
} from "./quality-gate-checks";
import { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import {
  isQualityGateConfigured,
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  runQualityGateOnExportable,
  shouldPromoteAfterRepair,
} from "./preview-quality-gate";
import { DEFAULT_MODEL_ID, ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import {
  LLM_FIXER_RETRY_TIMEOUT_MS,
  LLM_FIXER_TIMEOUT_MS,
  SERVER_REPAIR_MAX_PASSES,
} from "@/lib/gen/defaults";
import {
  buildGroupedRepairErrorContext,
  buildRepairErrorContextLines,
  runRepairLoop,
  type RepairErrorManifest,
} from "./repair-loop";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
  resolveServerRepairOutcome,
  type ServerRepairEarlyStop,
  type ServerVerifyFailedOutput,
} from "./server-verify-log-meta";
import { resolvePostRepairFinalize } from "./server-repair-policy";

const inflight = new Set<string>();

/**
 * Best-effort TF-IDF error-log RAG producer coverage for the quality-gate
 * failures that trigger a server-side repair (real build/typecheck/lint
 * errors from `runQualityGateOnExportable` / the preview-VM build-error SSE)
 * — not just the LLM verifier's own findings (`verifier-phase.ts`). Logged as
 * `still-failing` at the moment the gate fails; the repair loop's OWN outcome
 * (`repair-loop.ts`) records whether the subsequent repair actually fixed it.
 * NEVER throws and never affects verification/repair control flow.
 */
export function logQualityGateFailuresBestEffort(params: {
  chatId: string;
  versionId: string;
  failedOutputs: ServerVerifyFailedOutput[];
  generationMode?: "init" | "followup" | "auto_repair" | null;
}): void {
  try {
    for (const failure of params.failedOutputs.slice(0, 5)) {
      appendErrorLogEvent({
        phase: "quality-gate",
        subphase: "server-verify",
        creator: "server-verify",
        severity: "error",
        fault: `quality-gate:${failure.check}`,
        faultText: failure.output ?? "",
        provider: "own-engine",
        result: "still-failing",
        chatId: params.chatId,
        versionId: params.versionId,
        generationMode: params.generationMode ?? null,
      });
    }
  } catch {
    // best-effort — must never affect the verify/repair path
  }
}

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

type LeaseOutcome = { proceed: true; runId?: string } | { proceed: false };

/**
 * Acquire the distributed per-version lease (Plan C / P1). The local `inflight`
 * Set is the cheap pre-DB short-circuit; this is the cross-instance truth.
 *
 *  - lease granted        -> { proceed: true, runId }
 *  - another live lease   -> { proceed: false } (another instance owns it; bail)
 *  - DB error / no table  -> { proceed: true, runId: undefined } — degrade to the
 *    legacy Set-only behaviour rather than disabling verify/repair or crashing a
 *    fire-and-forget job (the additive migration ships before this code per the
 *    plan's deploy order, so this window is normally zero).
 */
async function acquireVerifyLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<LeaseOutcome> {
  try {
    const lease = await acquireVersionLease(versionId, kind);
    if (!lease) return { proceed: false };
    return { proceed: true, runId: lease.runId };
  } catch (err) {
    warnLog(
      "engine",
      "[server-verify] version lease acquire failed; falling back to process-local Set only",
      { versionId, kind, error: err instanceof Error ? err.message : String(err) },
    );
    return { proceed: true, runId: undefined };
  }
}

async function releaseVerifyLease(versionId: string, runId: string | undefined): Promise<void> {
  if (!runId) return;
  await releaseVersionLease(versionId, runId).catch(() => {});
}

async function isLatestVersionForChat(chatId: string, versionId: string): Promise<boolean> {
  const preferred = (await getPreferredVersion(chatId).catch(() => null))
    ?? (await getLatestVersion(chatId).catch(() => null));
  return !preferred || preferred.id === versionId;
}

/**
 * Fire-and-forget server-side verification + capped repair loop.
 * Called from generation stream after finalize. Does NOT block the SSE response.
 *
 * `diagnosticOnly` (default false) skips both auto-promotion and the
 * auto-repair loop — we only persist quality-gate findings as logs so
 * SSR/build-error visibility exists for whitelisted UIs even when the
 * version has verifier-blocking findings (in which case promotion is
 * disallowed by design).
 */
export async function triggerServerVerification(params: {
  chatId: string;
  versionId: string;
  diagnosticOnly?: boolean;
  /**
   * Force `build` into the initial verify gate (#260 Codex P2). Set by the
   * post-supersede re-verify when the abandoned repair was build-originated, so
   * the current files (B) are not false-greened by the typecheck-only lane while
   * a Next build failure still lingers. Defaults to off for the normal F2 path.
   */
  forceBuildCheck?: boolean;
  /**
   * Fas 3 (RepairGate): finalize's `RepairLedger`, handed over so a repair in
   * THIS lane dedupes against content+diagnostics already LLM-repaired during
   * finalize (same process — server-verify is fired from post-finalize).
   * Omitted (manual re-verify, watchdog) → a fresh per-run ledger.
   */
  repairLedger?: RepairLedger;
  /** Fas 3: finalize's `repairScopeId` — must accompany `repairLedger` so ledger keys collide across lanes. */
  repairScopeId?: string;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  const {
    chatId,
    versionId,
    onRepairAvailable,
    diagnosticOnly = false,
    forceBuildCheck = false,
    repairLedger,
    repairScopeId,
  } = params;
  if (!isServerVerifyEligible(versionId)) return;
  inflight.add(versionId);
  const lease = await acquireVerifyLease(versionId, "server_verify");
  if (!lease.proceed) {
    // Another live lease already owns this version (another instance/run) —
    // bail exactly like the old process-local Set short-circuit.
    inflight.delete(versionId);
    return;
  }
  const runId = lease.runId;
  // #260 Codex P2 (stale-base re-verify): set when the repair no-op'd because a
  // concurrent user edit advanced files_json past the repaired-from snapshot.
  let supersededByUserEdit = false;
  // #260 Codex P2 (build-origin false-green): carry the abandoned repair's
  // build-origin into the post-supersede re-verify so B's gate keeps `build`.
  let reverifyForceBuildCheck = false;
  // #260 Codex P2 / Bugbot (no fail of B from a stale repair on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness before failing (staleBaseNoOp lives inside tryServerRepairLoop and
  // is lost when it throws).
  let baseFilesJsonForRecovery: string | null = null;

  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:superseded",
        message: "Background verification skipped because a newer version already exists.",
        meta: { serverOwned: true },
      }]).catch(() => null);
      return;
    }
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot || snapshot.files.length === 0) return;
    const codeFiles = snapshot.files;
    // #260 / P2 #5: carry the exact files_json the repair will be based on so a
    // concurrent user edit can't be silently overwritten by saveRepairedFiles.
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    // F2/F3 policy derived from the version lifecycle. Threaded into BOTH the
    // initial verify gate (below) AND the repair loop so an F3/integrations
    // version is always gated on the full integrations lane (typecheck + build
    // + lint) and is never green-lit on the F2/design (typecheck-only) lane
    // (#291 Codex P1 — the first gate can `promoteVersion` before the repair
    // branch is ever reached).
    const previewPolicy =
      snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";

    await markVersionVerifying(versionId, undefined, runId).catch(() => null);

    const exportable = await buildExportableProject(codeFiles);
    const gateResult = await runQualityGateOnExportable({
      chatId,
      versionId,
      exportable,
      // #260 Codex P2: normally the typecheck-only design-preview lane, but a
      // post-supersede re-verify of a build-originated repair keeps `build` so a
      // still-broken Next build cannot pass on typecheck alone.
      // #291 Codex P1: an F3/integrations version is always gated on the full
      // integrations lane so it cannot green-light on the F2/design lane.
      checks: resolvePostRepairGateChecks(forceBuildCheck, previewPolicy),
    });
    if (!gateResult) {
      await failVersionVerification(versionId, "Quality gate unavailable during verification.", runId).catch(() => null);
      return;
    }

    const passed = qualityGateAllPassed(gateResult.results);
    const lintAdvisories = gateResult.results.filter(
      (result) => result.check === "lint" && result.advisory === true,
    );

    // F2 render-first (#330): a design-preview (F2) version whose ONLY failing
    // check is `typecheck` is advisory (see `isTypecheckOnlyAdvisory`) — `next
    // dev` renders despite TS type errors, so promote instead of repairing.
    // Computed BEFORE the `version.verifier.done` emit + summary log so an
    // advisory promotion never first emits a `failed`/`blocked` verifier event
    // or an error-level log: that stale terminal-`failed` bus signal would
    // survive `reconcileTerminalDbState` as a false-red "Ej verifierad" even
    // after the row is promoted to `passed`. Mirrors the client quality-gate
    // route so the two gate paths never disagree. NEVER in `diagnosticOnly`
    // mode (verifier blockers still forbid promotion → falls through to the
    // diagnostic fail branch below).
    const f2TypecheckAdvisory = isTypecheckOnlyAdvisory({
      isDesignPreview: previewPolicy === "fidelity2",
      gatePassed: passed,
      buildOriginated: forceBuildCheck,
      results: gateResult.results,
    });
    const advisoryPromote = f2TypecheckAdvisory && !diagnosticOnly;

    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable,
      results: gateResult.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Visual QA error (non-fatal):", vqaErr);
      },
    });

    // For the advisory case, ATTEMPT the promotion before emitting the outcome
    // so the bus signal reflects reality. `promoteVersion` is lease-conditioned:
    // a no-op (null) means a takeover/lease-loss or a guard/DB refusal.
    const advisoryPromoted = advisoryPromote
      ? Boolean(
          await promoteVersion(
            versionId,
            "F2 render-first: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande).",
            runId,
          ).catch(() => null),
        )
      : false;

    // Advisory promote that did NOT take (lease takeover / guard / transient DB
    // write). Emit NO terminal bus event: a terminal bus `failed` is sticky in
    // `reconcileTerminalDbState` (a later DB `passed` from the client
    // quality-gate route or a takeover run cannot upgrade a bus already
    // `failed`), so a `failed` here would pin a false-red even after the version
    // is promoted elsewhere. Leaving the bus spinning lets the authoritative DB
    // `passed` upgrade it to `done`, and the stale-verification watchdog is the
    // backstop if nothing promotes. Failing the row here would also clobber the
    // owning run on a lease takeover.
    if (advisoryPromote && !advisoryPromoted) {
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "info",
        category: "quality-gate:typecheck-advisory",
        message:
          "F2 render-first: advisory-promotering utfördes inte (lease/guard/DB) — lämnar terminalstatus till DB/route/watchdog.",
        meta: { serverOwned: true, advisory: true, advisoryPromoted: false },
      }]).catch(() => null);
      return;
    }

    // Green for the outcome bus signal / summary log when the VM gate passed OR
    // the advisory promotion actually took.
    const outcomeIsGreen = passed || advisoryPromoted;

    // OMTAG-06: emit `version.verifier.done` as the canonical outcome
    // signal. The DB sink subscriber (see `event-bus-error-log-sink.ts`)
    // still persists the legacy `engine_version_error_logs` row via the
    // same payload, so no downstream reader breaks.
    const qualityGateMeta = buildServerVerifyQualityGateMeta({
      passed,
      advisory: f2TypecheckAdvisory || lintAdvisories.length > 0,
      advisoryChecks: f2TypecheckAdvisory
        ? ["typecheck"]
        : lintAdvisories.length > 0
          ? ["lint"]
          : [],
      results: gateResult.results,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      visualQA: visualQA ? compactVisualQAForQualityGateLog(visualQA) : undefined,
    });
    emitBusEvent({
      t: "version.verifier.done",
      versionId,
      chatId,
      outcome: outcomeIsGreen ? "passed" : "failed",
      blocked: !outcomeIsGreen,
      findings: outcomeIsGreen
        ? []
        : gateResult.results
            .filter((r) => !r.passed)
            .map((r) => ({ id: r.check, detail: r.output?.slice(0, 200) ?? "" })),
    });
    if (advisoryPromoted) {
      // Advisory promotion must not read as SOLID green on the status
      // projection: mark the run degraded ("klar med varningar") — mirrors the
      // quality-gate route's advisory emit so both paths surface identically.
      emitBusEvent({
        t: "version.degraded",
        versionId,
        chatId,
        kind: "typecheck_advisory",
        message:
          "F2 render-first: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: ["typecheck"] },
      });
    }
    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: passed
        ? lintAdvisories.length > 0
          ? "warning"
          : "info"
        : advisoryPromoted
          ? "warning"
          : "error",
      category: advisoryPromoted ? "quality-gate:typecheck-advisory" : "preflight:quality-gate",
      message: passed
        ? lintAdvisories.length > 0
          ? "Server verify passed with lint warnings (advisory)."
          : "Server verify passed."
        : advisoryPromoted
          ? "F2 render-first: typecheck-varning (advisory) — previewen renderar; server-verify promotade utan repair."
          : "Server verify failed.",
      meta: advisoryPromoted
        ? { ...qualityGateMeta, advisory: true, failedChecks: ["typecheck"] }
        : qualityGateMeta,
    }]).catch((err) => {
      console.warn("[server-verify] Failed to persist quality gate summary log:", err);
    });

    // Advisory promotion succeeded (the no-op case returned above); done.
    if (advisoryPromoted) {
      return;
    }

    if (passed) {
      if (diagnosticOnly) {
        // Diagnostics-only mode: even a passing gate must NOT promote,
        // because verifier-blocking findings (which the caller
        // explicitly knew about when picking diagnosticOnly) still
        // disallow promotion regardless of build/typecheck status.
        await createEngineVersionErrorLogs([{
          chatId,
          versionId,
          level: "info",
          category: "server-verify:diagnostic",
          message:
            "Server verify gate passed but promotion is suppressed (verifier blockers exist).",
          meta: { serverOwned: true, diagnosticOnly: true },
        }]).catch(() => null);
        // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
        // Since runner.ts no longer pre-commits `failed` for verifier-only
        // blocking, server-verify is the authority that must set terminal
        // state. A verifier-LLM/real-build mismatch (verifier flagged, tsc
        // passed) still disallows promotion, so resolve to `failed` with a
        // summary that distinguishes this case from a real build failure.
        await failVersionVerification(
          versionId,
          "Verifier-LLM flagged blocking findings; server-verify gate passed. Manual review or repair required.",
          runId,
        ).catch(() => null);
        return;
      }
      const promoted = await promoteVersion(
        versionId,
        lintAdvisories.length > 0
          ? "Automatic server verification passed with lint warnings (advisory)."
          : "Automatic server verification passed.",
        runId,
      ).catch(() => null);
      if (promoted && lintAdvisories.length > 0) {
        try {
          emitBusEvent({
            t: "version.degraded",
            versionId,
            chatId,
            kind: "lint_advisory",
            message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
            meta: {
              advisoryChecks: ["lint"],
              warningCount: lintAdvisories.reduce(
                (sum, result) => sum + (result.warningCount ?? 0),
                0,
              ),
            },
          });
        } catch {
          // Telemetry only — never invalidate a successful promotion.
        }
      }
      return;
    }

    const failedOutputs = gateResult.results
      .filter((r) => !r.passed && r.repairable !== false)
      .map((r) => ({
        check: r.check,
        exitCode: r.exitCode,
        output: r.output,
        durationMs: r.durationMs ?? null,
      }));
    const nonRepairableFailures = gateResult.results.filter(
      (result) => !result.passed && result.repairable === false,
    );
    if (nonRepairableFailures.length > 0) {
      await createEngineVersionErrorLogs(
        nonRepairableFailures.map((result) => ({
          chatId,
          versionId,
          level: "error" as const,
          category: `quality-gate:${result.check}-tooling`,
          message: `${result.check} tooling/configuration failure; not repairable as user code.`,
          meta: {
            failureKind: result.failureKind ?? "tooling",
            output: result.output.slice(0, 12_000),
            serverOwned: true,
          },
        })),
      ).catch(() => null);
      if (failedOutputs.length === 0) {
        await failVersionVerification(
          versionId,
          `ReleaseGate tooling/configuration failure (${nonRepairableFailures
            .map((result) => result.check)
            .join(", ")}); automatic code repair was not started.`,
          runId,
        ).catch(() => null);
        return;
      }
    }
    logQualityGateFailuresBestEffort({ chatId, versionId, failedOutputs });

    if (diagnosticOnly) {
      // Diagnostics-only mode: log the failures and return. Do NOT enter
      // the repair loop — that would mutate the version under
      // conditions where promotion is forbidden anyway, and would
      // contribute to the regress-on-repair pattern (see Snickar
      // Anders log: blocking went from 1 → 3 across two repair passes
      // because every pass mutated and re-failed). Surfacing the
      // failures is enough; manual repair via the explicit
      // `/api/engine/chats/.../repair` HTTP path is still available
      // for the user.
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:diagnostic",
        message:
          "Server verify gate failed but auto-repair suppressed (verifier blockers already exist; surface findings for inspection only).",
        meta: {
          serverOwned: true,
          diagnosticOnly: true,
          failedChecks: failedOutputs.map((f) => f.check),
        },
      }]).catch(() => null);
      // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
      // See matching comment in the `passed` branch above. Here verifier-LLM
      // and server-verify both agree the version is broken, so resolve to
      // `failed` cleanly. `triggerBuildErrorRepair` can still flip this to
      // `repair_available` later when the VM emits a build-error SSE.
      await failVersionVerification(
        versionId,
        `Verifier-LLM blockers + server-verify gate failed (${failedOutputs
          .map((f) => f.check)
          .join(", ")}).`,
        runId,
      ).catch(() => null);
      return;
    }

    const repairOutcome = await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      previewPolicy,
      failedOutputs,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      onRepairAvailable,
      runId,
      // #260 Codex P2 (forced build gate): a build-originated re-verify keeps
      // `build` in the post-repair gate even if this round only re-fails tsc.
      forceBuildGate: forceBuildCheck,
      repairLedger,
      repairScopeId,
    });
    supersededByUserEdit = repairOutcome.supersededByUserEdit;
    reverifyForceBuildCheck = repairOutcome.buildOriginated;
  } catch (err) {
    console.error("[server-verify] Error:", err);
    // #260 Codex P2 / Bugbot (no fail of B from a stale repair): staleBaseNoOp
    // lives inside tryServerRepairLoop and is lost when it throws, so the outer
    // catch must re-check here. If a concurrent user edit advanced files_json
    // past the snapshot this run was based on, do NOT finalize the newer edit B
    // as failed from the abandoned repair(A) — re-verify B instead (build kept in
    // the gate, conservatively, since the crash hid which checks were failing).
    let staleAfterError = false;
    if (baseFilesJsonForRecovery !== null) {
      const current = await getVersionFilesSnapshot(versionId).catch(() => null);
      if (current && current.filesJson !== baseFilesJsonForRecovery) {
        staleAfterError = true;
      }
    }
    if (staleAfterError) {
      supersededByUserEdit = true;
      reverifyForceBuildCheck = true;
    } else {
      await failVersionVerification(
        versionId,
        "Server verification could not complete.",
        runId,
      ).catch(() => null);
    }
  } finally {
    await releaseVerifyLease(versionId, runId);
    inflight.delete(versionId);
  }

  // #260 Codex P2 (stale-base re-verify): the repair was superseded by a
  // concurrent user edit. Re-verify the CURRENT files (B) on a fresh lease — run
  // AFTER the release above so the re-entry can acquire its own lease. B then
  // reaches a terminal state on its OWN merits (passed / repair_available /
  // failed-because-B-fails), never failed from the abandoned stale repair(A).
  // Recursion is naturally bounded by user edits (one re-verify per edit).
  if (supersededByUserEdit) {
    await triggerServerVerification({
      chatId,
      versionId,
      onRepairAvailable,
      diagnosticOnly,
      forceBuildCheck: reverifyForceBuildCheck,
      // Fas 3: keep the run's ledger across the re-verify — the current files
      // (B) differ from the repaired base, so legitimate retries are not
      // blocked (contentHash differs), while an identical re-attempt dedupes.
      repairLedger,
      repairScopeId,
    });
  }
}

/**
 * Resolves whether the post-VM build-error auto-repair loop is enabled
 * for the current runtime. Defaults to ON in `development` and Vercel
 * `preview` (so the loop is exercised constantly during build), and OFF
 * in `production` until we have enough live data to flip the default
 * there too. Explicit `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=0|1|true|false`
 * always wins over the default.
 */
function isAutoRepairBuildErrorEnabled(): boolean {
  const explicit = process.env.SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "on" || explicit === "yes") {
    return true;
  }
  if (explicit === "0" || explicit === "false" || explicit === "off" || explicit === "no") {
    return false;
  }
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (vercelEnv === "production") return false;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "development" || nodeEnv === "test") return true;
  return false;
}

/**
 * Auto-trigger a server-side repair loop when the live preview-VM emits
 * a `build-error` SSE (npm install / next build / dev server crashed).
 *
 * Closes the gap between "the user mental model" — *VM-fel ska åka
 * tillbaka in i repair-kedjan automatiskt* — and the previous reality,
 * where build-error only triggered a UI banner unless the user
 * manually clicked "Repair" or the F2 verification policy happened to
 * also schedule server-verify (which it usually doesn't in design
 * mode, see `resolvePostFinalizeServerVerifyDecision`).
 *
 * **Default on in dev/preview** (Wave 4 of the LLM-flow consolidation).
 * Production still waits for explicit opt-in via
 * `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1` until we have enough field
 * data to flip the production default. Same `inflight` dedup as
 * server-verify, so we never run two repair loops on the same version
 * concurrently regardless of which path triggered them.
 */
/**
 * Utfall från `triggerBuildErrorRepair`. `void`-returen behölls tidigare (alla
 * finalize/preview-anropare kör fire-and-forget), men A3:s manuella
 * deploy-repair-endpoint behöver veta om en `repair_available`-version faktiskt
 * producerades för att kunna svara UI:t.
 */
export type BuildErrorRepairOutcome = {
  /** Sant om repair-loopen faktiskt kördes (klarade eligibility + fick lease). */
  started: boolean;
  /** Sant om en repair sparades (`repair_available`) — `onRepairAvailable` fyrade. */
  repairAvailable: boolean;
  /** Varför loopen inte kördes, när `started === false`. */
  skippedReason?:
    | "auto_repair_disabled"
    | "not_eligible"
    | "lease_busy"
    | "not_latest"
    | "no_files";
};

export async function triggerBuildErrorRepair(params: {
  chatId: string;
  versionId: string;
  buildError: {
    stage: string;
    message: string;
    failureCode?: string | null;
  };
  /** Fas 3 (RepairGate): finalize's ledger + scope — see triggerServerVerification. */
  repairLedger?: RepairLedger;
  repairScopeId?: string;
  /**
   * A3: kringgå `isAutoRepairBuildErrorEnabled()`-env-gaten. Sätts av den
   * MANUELLA deploy-repair-endpointen ("Publicera om med fix") — knappen ska
   * fungera oavsett auto-repair-flaggan (auto-redeploy förblir av; detta är ett
   * explicit knapptryck, inte auto-trigger).
   */
  force?: boolean;
  /**
   * A3: absolut `Date.now()`-deadline som binder repair-loopen till den anropande
   * route:ns `maxDuration` (deploy-repair-endpointen är synkron, till skillnad
   * från finalize/preview som är fire-and-forget). Trädas ner i `runRepairLoop`.
   * Utelämnad → obundet (dagens bakgrundsbeteende).
   */
  repairDeadlineEpochMs?: number;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<BuildErrorRepairOutcome> {
  const { force = false, repairDeadlineEpochMs } = params;
  if (!force && !isAutoRepairBuildErrorEnabled()) {
    return { started: false, repairAvailable: false, skippedReason: "auto_repair_disabled" };
  }
  const { chatId, versionId, buildError, onRepairAvailable, repairLedger, repairScopeId } = params;
  if (!isServerVerifyEligible(versionId)) {
    return { started: false, repairAvailable: false, skippedReason: "not_eligible" };
  }
  // A3: fånga om en repair faktiskt sparades (repair_available) så det manuella
  // endpointet kan svara UI:t, utan att ändra callback-kontraktet för de
  // befintliga fire-and-forget-anroparna.
  let repairAvailable = false;
  const trackedOnRepairAvailable = (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }): void => {
    repairAvailable = true;
    onRepairAvailable?.(payload);
  };
  // OMTAG-06 / Codex P2: surface the preview-VM build error as a first-class bus
  // event BEFORE acquiring the lease, so the signal (and its error-log
  // projection) is never dropped when another job already owns the version —
  // only the mutating repair below is skipped in that case. The projection will
  // flip `phase` to "failed" until a clean repair pass lands and emits
  // `version.saved` without blockers.
  emitBusEvent({
    t: "version.build.error",
    versionId,
    chatId,
    error: {
      stage: buildError.stage,
      message: buildError.message,
      failureCode: buildError.failureCode ?? null,
    },
    level: "error",
    category: "preview-vm",
  });
  inflight.add(versionId);
  const lease = await acquireVerifyLease(versionId, "build_error_repair");
  if (!lease.proceed) {
    // Another live lease already owns this version — the build-error event is
    // already emitted above; skip only the mutating repair to avoid racing it.
    inflight.delete(versionId);
    return { started: false, repairAvailable: false, skippedReason: "lease_busy" };
  }
  const runId = lease.runId;
  // A3-utfall: sätts när loopen faktiskt körs / hoppas över inuti try/finally.
  let started = false;
  let skippedReason: BuildErrorRepairOutcome["skippedReason"];
  let supersededByUserEdit = false;
  // #260 Codex P2: this loop is always build-originated; carry that into the
  // post-supersede re-verify so the current files' gate keeps `build`.
  let reverifyForceBuildCheck = false;
  // #260 Codex P2 / Bugbot (no stuck `repairing` / no fail of B on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness and schedule a re-verify instead of leaving B stuck in `repairing`.
  let baseFilesJsonForRecovery: string | null = null;
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      skippedReason = "not_latest";
      return { started, repairAvailable, skippedReason };
    }
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot || snapshot.files.length === 0) {
      skippedReason = "no_files";
      return { started, repairAvailable, skippedReason };
    }
    started = true;
    const codeFiles = snapshot.files;
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    const failureCodeSuffix = buildError.failureCode ? ` [${buildError.failureCode}]` : "";
    const failedOutput: ServerVerifyFailedOutput = {
      check: "build",
      exitCode: 1,
      output: `[preview-vm:${buildError.stage}]${failureCodeSuffix} ${buildError.message}`,
      durationMs: null,
    };
    logQualityGateFailuresBestEffort({
      chatId,
      versionId,
      failedOutputs: [failedOutput],
    });
    const repairOutcome = await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      previewPolicy:
        snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2",
      failedOutputs: [failedOutput],
      verifyLaneDurationMs: 0,
      firstFailureCheck: "build",
      jobStartedAt: null,
      jobFinishedAt: null,
      onRepairAvailable: trackedOnRepairAvailable,
      runId,
      // #260 Codex P2 (forced build gate): this path is always build-originated.
      forceBuildGate: true,
      // A3: bind loopen till den synkrona endpointens maxDuration (utelämnad för
      // fire-and-forget-anroparna → obundet, dagens beteende).
      repairDeadlineEpochMs,
      repairLedger,
      repairScopeId,
    });
    supersededByUserEdit = repairOutcome.supersededByUserEdit;
    reverifyForceBuildCheck = repairOutcome.buildOriginated;
  } catch (err) {
    console.error("[server-verify] build-error repair failed:", err);
    // #260 Codex P2 / Bugbot: if a concurrent user edit advanced files_json past
    // this run's snapshot, don't leave B stuck in `repairing` with no recovery —
    // schedule the post-finally re-verify of B (build kept in the gate) instead
    // of swallowing the error and stranding the row.
    if (baseFilesJsonForRecovery !== null) {
      const current = await getVersionFilesSnapshot(versionId).catch(() => null);
      if (current && current.filesJson !== baseFilesJsonForRecovery) {
        supersededByUserEdit = true;
        reverifyForceBuildCheck = true;
      }
    }
  } finally {
    await releaseVerifyLease(versionId, runId);
    inflight.delete(versionId);
  }

  // #260 Codex P2 (stale-base re-verify): a concurrent user edit advanced
  // files_json past the repaired-from snapshot, so the repair no-op'd and did
  // NOT fail the version. Re-verify the CURRENT files (B) on a fresh lease (run
  // AFTER releasing this run's lease) so B reaches an honest terminal state
  // instead of lingering in `repairing`. See triggerServerVerification.
  if (supersededByUserEdit) {
    await triggerServerVerification({
      chatId,
      versionId,
      onRepairAvailable: trackedOnRepairAvailable,
      forceBuildCheck: reverifyForceBuildCheck,
      repairLedger,
      repairScopeId,
    });
  }

  return { started, repairAvailable, skippedReason };
}

/**
 * Outcome of a server-repair loop run. `supersededByUserEdit` is set when the
 * repair no-op'd because a concurrent user edit advanced `files_json` past the
 * snapshot the repair was based on (#260 Codex P2 `stale_base`). The caller MUST
 * then re-verify the CURRENT files on a fresh lease so the user's newer edit B
 * reaches an honest terminal state instead of lingering in `repairing` (where
 * the readiness watchdog could fail it). Every other outcome already left the
 * row terminal (`repair_available` / `failed`).
 */
interface ServerRepairLoopOutcome {
  supersededByUserEdit: boolean;
  /**
   * The repair was entered from a build/preview-start failure. When the repair
   * is superseded by a concurrent user edit, the caller's re-verify of the
   * CURRENT files (B) MUST keep `build` in its gate — re-verifying B with the
   * typecheck-only design-preview lane could false-green a still-broken build,
   * reintroducing exactly the case this change fixes (#260 Codex P2).
   */
  buildOriginated: boolean;
}

async function tryServerRepairLoop(params: {
  chatId: string;
  versionId: string;
  codeFiles: CodeFile[];
  /** Exact files_json the repair is based on (#260 / P2 #5 revision-binding). */
  baseFilesJson: string;
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
  /** Distributed-lease owner id (Plan C). Undefined = legacy Set-only path. */
  runId?: string;
  /**
   * Version preview policy (F2 `"fidelity2"` / F3 `"fidelity3"`). Threaded into
   * `runRepairLoop` so the deterministic import-repair only (re)introduces
   * tier-3 backend SDK imports in F3. Omitted → F2-safe.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
  /**
   * #260 Codex P2 (forced build gate): the re-verify that spawned this loop was
   * intentionally build-originated (`forceBuildCheck`). OR this into the local
   * `buildOriginated` so a round where `build` passes but `typecheck` fails does
   * not drop `build` from the post-repair gate and false-green a still-broken
   * build. `triggerBuildErrorRepair` always passes `true`.
   */
  forceBuildGate?: boolean;
  /**
   * A3: absolut `Date.now()`-deadline som trädas ner i `runRepairLoop` så en
   * SYNKRON anropare (deploy-repair-endpointen) kan binda loopen till sin
   * route-`maxDuration`. Utelämnad → obundet (bakgrundskörning: server-verify /
   * post-finalize auto-repair, dagens beteende).
   */
  repairDeadlineEpochMs?: number;
  /** Fas 3 (RepairGate): shared ledger + scope for cross-lane dedupe. */
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}): Promise<ServerRepairLoopOutcome> {
  const {
    chatId,
    versionId,
    codeFiles,
    baseFilesJson,
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    onRepairAvailable,
    runId,
    previewPolicy,
    forceBuildGate = false,
    repairDeadlineEpochMs,
  } = params;
  // Fas 3: without a finalize handover, use a fresh per-run ledger + a
  // version-bound scope (mirrors runner.ts's `{base}:{pass}` pattern) so the
  // loop still dedupes identical retries within this repair run.
  const repairLedger = params.repairLedger ?? new RepairLedger();
  const repairScopeId = params.repairScopeId ?? `${versionId}:server-repair`;
  const verifyContext = {
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
  };
  const hadQualityGateFailures = failedOutputs.length > 0;
  // #260 Codex P2 (build-origin false-green): the repair was entered from a
  // build/preview-start failure. Check ALL original failures, not just
  // `firstFailureCheck`: when typecheck AND build both failed, `firstFailureCheck`
  // is "typecheck", yet the build must still be re-run — both in the post-repair
  // gate below AND in the caller's post-supersede re-verify of the current files.
  // `forceBuildGate` carries an intentionally build-originated re-verify so a
  // round that only re-fails on typecheck cannot drop `build` from the gate.
  const buildOriginated =
    forceBuildGate ||
    failedOutputs.some((output) => output.check === "build") ||
    firstFailureCheck === "build";
  // #260 Codex P2 (repair-vs-edit finalize): set when saveRepairedFiles no-ops
  // because a concurrent user edit advanced files_json past the repaired-from
  // snapshot. Used after the loop to skip failVersionVerification so the user's
  // newer edit is never finalized as failed from a stale repair(A).
  let staleBaseNoOp = false;

  await markVersionRepairing(versionId, undefined, runId).catch(() => null);
  // NOTE: intentionally NOT emitting version.repair.started/passIndex here.
  // Surfacing bounded "Reparerar X/2" for the server-verify auto-repair path
  // would require a terminal bus event when the loop finishes — but its
  // success outcome is `repair_available` (awaiting accept), which has no clean
  // terminal phase in the bus lifecycle, so emitting repair.started alone would
  // strand the projection in `repairing` (Bugbot #340). The finalize-runner
  // repair path DOES emit + settle, so the UI progress works there. Wiring the
  // server-verify path is tracked as a follow-up (needs a repair_available
  // bus-settle). See BUG-SWARM-BACKLOG.md.

  const exportable = await buildExportableProject(codeFiles);
  const initialContent = serializeCodeProject(exportable);

  async function tryPromoteAfterGate(projectContent: string, method: "deterministic" | "llm"): Promise<boolean> {
    // Codex P2 (renew before the post-repair gate): the per-pass onBeforePass
    // renewal only covers the LLM passes. shouldPromoteAfterRepair below runs a
    // preview-host verify that can take up to 300s, after which the
    // renew-before-save fires. Since renewVersionLease refuses expired leases,
    // a slow gate could otherwise expire the lease and no-op a valid
    // saveRepairedFiles. Renew here so the gate window is covered too.
    if (runId) await renewVersionLease(versionId, runId).catch(() => {});
    const rawRepairedFiles = parseCodeProject(projectContent).files;
    // Block the server-repair bypass of SCAFFOLD_PROTECTED_PATHS: even if
    // the LLM regenerates `app/api/placeholder/route.ts` (the JSX-in-`.ts`
    // failure mode that motivated the protected set) and the quality gate
    // happens to pass, never persist the LLM version. Re-inject the path
    // from `codeFiles` (the pre-repair persisted version) which already
    // carries the canonical scaffold/previous content. See
    // `@/lib/gen/scaffolds/protected-paths` for context.
    const protectedPartition =
      partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
    const reinjection = reinjectProtectedPathsFromFallback({
      kept: protectedPartition.kept,
      droppedPaths: protectedPartition.dropped.map((f) => f.path),
      fallbackFiles: codeFiles,
    });
    const repairedFiles = reinjection.files;
    if (protectedPartition.dropped.length > 0) {
      const droppedPaths = protectedPartition.dropped.map((f) => f.path);
      warnLog(
        "engine",
        "Scaffold-protected paths emitted by repair LLM — dropped from saveRepairedFiles input",
        {
          chatId,
          versionId,
          droppedPaths,
          reinjected: reinjection.reinjected,
          stillMissing: reinjection.stillMissing,
          branch: "server-repair",
          method,
        },
      );
      devLogAppend("in-progress", {
        type: "scaffold-protected-overwrite-blocked",
        chatId,
        versionId,
        branch: "server-repair",
        method,
        droppedPaths,
        reinjected: reinjection.reinjected,
        stillMissing: reinjection.stillMissing,
      });
    }
    const exportableForGate = await buildExportableProject(repairedFiles);
    const decision = await shouldPromoteAfterRepair({
      chatId,
      versionId,
      exportable: exportableForGate,
      hadQualityGateFailures,
      // Fas 3 same-signal-kontrakt: the post-repair gate must re-run every
      // check that originally failed — a repair is only "repaired" when the
      // SAME signal passes again. Union of the base lane (#260 build-origin
      // escalation, #291 F3 integrations lane) and the origin failed checks.
      checks: resolveSameSignalGateChecks({
        originFailedChecks: failedOutputs.map((output) => output.check),
        buildOriginated,
        previewPolicy,
      }),
    });
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable: exportableForGate,
      results: decision.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Post-repair visual QA error (non-fatal):", vqaErr);
      },
    });
    const visualQAMeta = visualQA
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;
    let promoted = false;
    if (decision.promote) {
      if (!(await isLatestVersionForChat(chatId, versionId))) {
        await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
        await createEngineVersionErrorLogs([{
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Post-repair promotion skipped because a newer version already exists.",
          meta: {
            method,
            serverOwned: true,
          },
        }]).catch(() => null);
        return false;
      }
      const filesJson = JSON.stringify(repairedFiles);
      const msg =
        method === "deterministic"
          ? "Server repair passed quality gate (deterministic). Awaiting acceptance."
          : "Server repair passed quality gate (LLM). Awaiting acceptance.";
      // Renew the lease right before persisting: a long repair loop may have run
      // past the TTL. Renew re-extends it while we still own it (run_id +
      // status='running'); if another run took over, saveRepairedFiles's
      // lease-conditioned write no-ops, so we never clobber a newer repair.
      if (runId) await renewVersionLease(versionId, runId).catch(() => {});
      const saveResult = await saveRepairedFiles(versionId, filesJson, msg, runId, baseFilesJson).catch((err) => {
        console.warn("[server-verify] Failed to save repaired version files:", err);
        return { status: "failed" as const };
      });
      if (saveResult.status === "stale_base") {
        staleBaseNoOp = true;
      }
      const saved = saveResult.status === "saved" ? saveResult.version : null;
      promoted = Boolean(saved);
      if (saved && onRepairAvailable) {
        onRepairAvailable({
          versionId: saved.id,
          summary: saved.verification_summary,
          repairAvailableAt: saved.repair_available_at,
        });
      }
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: promoted ? "info" : "warning",
        category: "preflight:quality-gate",
        message: promoted
          ? `Post-repair quality gate passed (${method}); repair is ready for acceptance.`
          : decision.promote
            ? `Post-repair quality gate passed but repair could not be saved (${method}).`
            : "Post-repair quality gate did not pass; not promoting.",
        meta: buildServerVerifyQualityGateMeta({
          results: decision.results,
          verifyLaneDurationMs: decision.verifyLaneDurationMs,
          firstFailureCheck: decision.firstFailureCheck,
          jobStartedAt: decision.jobStartedAt,
          jobFinishedAt: decision.jobFinishedAt,
          repass: true,
          method,
          promoted,
          visualQA: visualQAMeta,
          errorManifest: groupedRepairContext.errorManifest,
        }),
      },
    ]).catch((err) => {
      console.warn("[server-verify] Failed to persist post-repair quality gate log:", err);
    });
    return promoted;
  }

  const originatingChat = await getChat(chatId).catch(() => null);
  const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
  // Bug 01#3 (2026-04-22 audit): fallback till default-tier (pro) när chat-
  // modellen inte mappar till en känd canonical tier. Tidigare blev fixerModel
  // `undefined` och runLlmFixer använde sin interna default — det bröt
  // förutsägbarheten i manifestens phaseRouting (reparation och fas 2 kunde
  // köra på olika tiers utan att det syntes i logs).
  const fixerTier = originatingTier ?? DEFAULT_MODEL_ID;
  const fixerModel = resolvePhaseModel(fixerTier, "fixer").modelId;
  const fixerThinking = resolvePhaseThinking(fixerTier, "fixer");

  const repairLogContext = buildRepairLogContextLines({
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    initialContent,
  });
  const groupedRepairContext = {
    errorManifest: repairLogContext.errorManifest,
  };

  // Fas 3 (base-aware tidig abort): checked by the loop at every pass start
  // and before the final gate. Detects BOTH superseded flavors:
  //   - a NEWER VERSION row exists (repair target is no longer the latest) —
  //     the existing promote path would mark it superseded AFTER doing all the
  //     work; abort early instead;
  //   - `files_json` advanced past the base snapshot (concurrent user edit) —
  //     the base-bound save would no-op (`stale_base`) after the work is done.
  let supersededKind: "newer_version" | "files_advanced" | null = null;
  const shouldAbortSuperseded = async (): Promise<boolean> => {
    if (supersededKind) return true;
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      supersededKind = "newer_version";
      return true;
    }
    const current = await getVersionFilesSnapshot(versionId).catch(() => null);
    if (current && current.filesJson !== baseFilesJson) {
      supersededKind = "files_advanced";
      return true;
    }
    return false;
  };

  const loopResult = await runRepairLoop({
    initialContent,
    chatId,
    previewPolicy,
    failedOutputs,
    contextLines: repairLogContext.contextLines,
    // Global budget (manifest `repairPolicies.serverRepairPasses`, default 2).
    // NOTE: the manifest also declares `perTierRepairPolicies`
    // (`getPerTierRepairPoliciesFromManifest()`), but it is not wired into any
    // pipeline yet — dead config. Wiring it would require resolving the active
    // model tier at this callsite; left for a follow-up rather than bolting a
    // tier lookup onto this hot path. (Task 6 report.)
    maxLlmPasses: SERVER_REPAIR_MAX_PASSES,
    llmTimeoutMs: LLM_FIXER_TIMEOUT_MS,
    llmRetryTimeoutMs: LLM_FIXER_RETRY_TIMEOUT_MS,
    // A3: bunden till anroparens route-maxDuration för synkron deploy-repair;
    // undefined för bakgrundskörning (obundet, dagens beteende).
    repairDeadlineEpochMs,
    fixerModel,
    fixerThinking: fixerThinking?.thinking,
    fixerReasoningEffort: fixerThinking?.reasoningEffort,
    recurringPatterns: readRecurringPatternsForChat(chatId),
    hasActionableErrorContext: hadQualityGateFailures,
    repairLedger,
    repairScopeId,
    shouldAbortSuperseded,
    onBeforePass: async () => {
      if (runId) await renewVersionLease(versionId, runId).catch(() => {});
    },
    onAttemptPromotion: async (projectContent, method) => ({
      promoted: await tryPromoteAfterGate(projectContent, method),
    }),
  });

  if (loopResult.promoted) {
    logRepairOutcome(
      chatId,
      versionId,
      loopResult.method ?? "llm",
      true,
      loopResult.llmPasses,
      0,
      undefined,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
    );
    return { supersededByUserEdit: false, buildOriginated };
  }

  // Fas 3 (base-aware tidig abort): the loop stopped because the version got
  // superseded mid-repair. Resolve per flavor:
  //  - newer_version: mark the row superseded (the same terminal state the
  //    promote path would have reached AFTER wasting the remaining budget) and
  //    log the canonical `superseded_by_newer_version` outcome. No re-verify —
  //    the newer version owns its own verify lifecycle.
  //  - files_advanced: identical semantics to a stale-base no-op — fall through
  //    via `staleBaseNoOp` so the caller re-verifies the CURRENT files (B).
  if (!loopResult.promoted && loopResult.earlyStopReason === "superseded") {
    if (supersededKind === "newer_version") {
      await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:superseded",
        message:
          "Server repair aborted early: a newer version exists, so the repair result would be discarded.",
        meta: { serverOwned: true, supersededKind },
      }]).catch(() => null);
      logRepairOutcome(
        chatId,
        versionId,
        "llm",
        false,
        loopResult.llmPasses,
        loopResult.remainingErrors,
        loopResult.earlyStopReason,
        verifyContext,
        fixerModel,
        loopResult.errorManifest,
      );
      return { supersededByUserEdit: false, buildOriginated };
    }
    staleBaseNoOp = true;
  }

  // #260 Codex P2 (stale-base before fail): a non-promoted repair never reached
  // saveRepairedFiles, so `staleBaseNoOp` can still be false even if a concurrent
  // user edit advanced files_json past the snapshot this repair was based on.
  // Re-read the current snapshot and treat a changed files_json as a stale-base
  // no-op so we re-verify the current files (B) on a fresh lease instead of
  // finalizing B as failed from this stale repair(A).
  if (!loopResult.promoted && !staleBaseNoOp) {
    const currentSnapshot = await getVersionFilesSnapshot(versionId).catch(() => null);
    if (currentSnapshot && currentSnapshot.filesJson !== baseFilesJson) {
      staleBaseNoOp = true;
    }
  }

  const finalizeAction = resolvePostRepairFinalize({
    staleBaseNoOp,
    remainingErrors: loopResult.remainingErrors,
  });

  if (finalizeAction === "skip_stale_base") {
    // #260 Codex P2: a concurrent user edit advanced files_json past snapshot A
    // while this repair ran, so saveRepairedFiles no-op'd by design. Do NOT
    // failVersionVerification — that would finalize the user's newer edit B as
    // failed from a stale repair(A). Signal the caller to re-verify the current
    // files (B) on a fresh lease so B reaches an honest terminal state instead
    // of lingering in `repairing` (where the readiness watchdog could fail it).
    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: "warning",
      category: "server-verify:stale-base-skip",
      message:
        "Post-repair finalize skipped: files_json advanced (concurrent edit); re-verifying the current files instead of failing from stale repair.",
      meta: { serverOwned: true, staleBaseNoOp: true },
    }]).catch(() => null);
    logRepairOutcome(
      chatId,
      versionId,
      "llm",
      false,
      loopResult.llmPasses,
      loopResult.remainingErrors,
      loopResult.earlyStopReason,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
    );
    return { supersededByUserEdit: true, buildOriginated };
  }

  if (finalizeAction === "fail_syntax_clean") {
    // Keep the cause honest: a wall-clock / fixer timeout is NOT an unresolved
    // gate, so don't blame the gate when the loop stopped on time budget
    // (Bugbot #318 — same branching as the manual repair route).
    const syntaxCleanSummary =
      loopResult.earlyStopReason === "time_budget_exceeded"
        ? `Server repair stopped after ${loopResult.llmPasses} attempt(s): time budget exceeded before the quality gate could be resolved (code is syntactically valid). Try again, or edit the file manually.`
        : `Server repair could not resolve the quality gate after ${loopResult.llmPasses} attempt(s): code is syntactically valid but typecheck/build still fails${loopResult.earlyStopReason ? ` (${loopResult.earlyStopReason})` : ""}. Try a smaller or more specific prompt, or edit the file manually.`;
    await failVersionVerification(versionId, syntaxCleanSummary, runId).catch(() => null);
    logRepairOutcome(
      chatId,
      versionId,
      "llm",
      false,
      loopResult.llmPasses,
      0,
      loopResult.earlyStopReason,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
      { remainingErrorsSource: "esbuild_syntax", syntaxCleanGateFailed: true },
    );
    return { supersededByUserEdit: false, buildOriginated };
  }

  const incompleteSummary =
    loopResult.earlyStopReason === "time_budget_exceeded"
      ? `Server repair stopped after ${loopResult.llmPasses} attempt(s): time budget exceeded with ${loopResult.remainingErrors} esbuild syntax error(s) remaining.`
      : `Server repair incomplete after ${loopResult.llmPasses} attempt(s): ${loopResult.remainingErrors} esbuild syntax error(s) remain${loopResult.earlyStopReason ? ` (${loopResult.earlyStopReason})` : ""}.`;
  await failVersionVerification(versionId, incompleteSummary, runId).catch(() => null);
  logRepairOutcome(
    chatId,
    versionId,
    "llm",
    false,
    loopResult.llmPasses,
    loopResult.remainingErrors,
    loopResult.earlyStopReason,
    verifyContext,
    fixerModel,
    loopResult.errorManifest,
    { remainingErrorsSource: "esbuild_syntax", syntaxCleanGateFailed: false },
  );
  return { supersededByUserEdit: false, buildOriginated };
}

function logRepairOutcome(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
  earlyStopReason?: ServerRepairEarlyStop | null,
  verifyContext?: {
    verifyLaneDurationMs: number;
    firstFailureCheck: string | null;
    jobStartedAt: string | null;
    jobFinishedAt: string | null;
  },
  fixerModelId?: string | null,
  errorManifest?: RepairErrorManifest | null,
  outcomeQualifier?: {
    remainingErrorsSource?: "esbuild_syntax" | "quality_gate";
    syntaxCleanGateFailed?: boolean;
  },
) {
  // The "remainingErrors" counter reflects esbuild parse errors, not the
  // quality-gate (tsc/build/eslint) outcome. The canonical taxonomy resolver
  // (Fas 0) surfaces the syntax-clean-but-gate-failed case explicitly so logs
  // don't read as "0 errors but somehow not promoted" (historic confusion).
  const { message } = resolveServerRepairOutcome({
    method,
    repaired,
    remainingErrors,
    syntaxCleanGateFailed: outcomeQualifier?.syntaxCleanGateFailed,
    earlyStopReason,
  });
  createEngineVersionErrorLogs([{
    chatId,
    versionId,
    level: repaired ? "info" : "warning",
    category: "server-repair",
    message,
    meta: {
      ...buildServerRepairOutcomeMeta({
        method,
        llmPasses,
        repaired,
        remainingErrors,
        remainingErrorsSource: outcomeQualifier?.remainingErrorsSource,
        syntaxCleanGateFailed: outcomeQualifier?.syntaxCleanGateFailed,
        earlyStopReason,
        verifyLaneDurationMs: verifyContext?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: verifyContext?.firstFailureCheck ?? null,
        jobStartedAt: verifyContext?.jobStartedAt ?? null,
        jobFinishedAt: verifyContext?.jobFinishedAt ?? null,
        errorManifest: errorManifest ?? null,
      }),
      ...(fixerModelId ? { fixerModelId } : {}),
    },
  }]).catch((err) => {
    console.warn("[server-verify] Failed to persist server-repair outcome log:", err);
  });
}

function buildRepairLogContextLines(params: {
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  initialContent: string;
}): {
  errorManifest: RepairErrorManifest;
  contextLines: string[];
} {
  const baseLines = [
    ...buildServerVerifyRepairContextLines({
      failedOutputs: params.failedOutputs,
      verifyLaneDurationMs: params.verifyLaneDurationMs,
      firstFailureCheck: params.firstFailureCheck,
      jobStartedAt: params.jobStartedAt,
      jobFinishedAt: params.jobFinishedAt,
    }),
    ...buildRepairErrorContextLines(params.failedOutputs),
  ];
  const grouped = buildGroupedRepairErrorContext(params.failedOutputs, {
    projectContent: params.initialContent,
  });
  return {
    errorManifest: grouped.errorManifest,
    contextLines: [...grouped.contextLines, ...baseLines],
  };
}
