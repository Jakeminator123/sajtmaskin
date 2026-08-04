import {
  markVersionVerifying,
  promoteVersion,
  failVersionVerification,
  markVersionSupersededByRepair,
} from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import {
  isTypecheckOnlyAdvisory,
  resolvePostRepairGateChecks,
} from "../quality-gate-checks";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import {
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  runQualityGateOnExportable,
} from "../preview-quality-gate";
import { REPAIR_LOOP_BUDGET_MS } from "@/lib/gen/defaults";
import {
  buildServerVerifyQualityGateMeta,
  collectLintAdvisories,
  compactVisualQAForQualityGateLog,
} from "../server-verify-log-meta";
import { resolveBackgroundRepairDeadlineEpochMs } from "../server-repair-policy";
import {
  acquireVerifyLease,
  inflight,
  isLatestVersionForChat,
  isServerVerifyEligible,
  releaseVerifyLease,
} from "./lease";
import { logQualityGateFailuresBestEffort, partitionServerVerifyFailures } from "./failures";
import { tryServerRepairLoop } from "./repair-execution";

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
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Background verification skipped because a newer version already exists.",
          meta: { serverOwned: true },
        },
      ]).catch(() => null);
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
    const previewPolicy = snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";

    await markVersionVerifying(versionId, undefined, runId).catch(() => null);

    // Imported repos (v0-templates / ZIP imports) verify verbatim so the gate
    // tests the SAME project the preview VM runs — never a scaffold-merged
    // variant with force-pinned baseline dependency versions.
    const verbatimRepo = await chatUsesVerbatimRepo(chatId);
    const exportable = await buildExportableProject(codeFiles, { verbatimRepo });
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
      await failVersionVerification(
        versionId,
        "Quality gate unavailable during verification.",
        runId,
      ).catch(() => null);
      return;
    }

    const passed = qualityGateAllPassed(gateResult.results);
    const lintAdvisories = collectLintAdvisories(gateResult.results);

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
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "info",
          category: "quality-gate:typecheck-advisory",
          message:
            "F2 render-first: advisory-promotering utfördes inte (lease/guard/DB) — lämnar terminalstatus till DB/route/watchdog.",
          meta: { serverOwned: true, advisory: true, advisoryPromoted: false },
        },
      ]).catch(() => null);
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
        message: "F2 render-first: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: ["typecheck"] },
      });
    }
    await createEngineVersionErrorLogs([
      {
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
      },
    ]).catch((err) => {
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
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId,
            level: "info",
            category: "server-verify:diagnostic",
            message:
              "Server verify gate passed but promotion is suppressed (verifier blockers exist).",
            meta: { serverOwned: true, diagnosticOnly: true },
          },
        ]).catch(() => null);
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

    const { failedOutputs, nonRepairableFailures } = partitionServerVerifyFailures(
      gateResult.results,
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
      await createEngineVersionErrorLogs([
        {
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
        },
      ]).catch(() => null);
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
      // Bind this fire-and-forget loop to a wall-clock ceiling so it cannot keep
      // burning LLM passes minutes after the user left (the background lane
      // previously passed no deadline → capped only by pass count + per-pass
      // timeouts). Reuses the lease-holding-route budget as a generous bound.
      repairDeadlineEpochMs: resolveBackgroundRepairDeadlineEpochMs({
        nowMs: Date.now(),
        budgetMs: REPAIR_LOOP_BUDGET_MS,
      }),
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
