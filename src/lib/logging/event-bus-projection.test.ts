/**
 * OMTAG-06 — `selectVersionStatus` projection tests.
 *
 * Ten scenarios (> 8 required by acceptance) covering every lifecycle
 * branch the UI consumes from the bus:
 *
 *   1. empty stream → idle
 *   2. streaming tokens → streaming
 *   3. autofix + syntax + preflight clean → preflighting
 *   4. preflight blocked → blocked
 *   5. verifier failed → failed
 *   6. repair started (no completion) → repairing
 *   7. repair success (new pass clears blockers) → preflighting
 *   8. build-error at end of stream → failed
 *   9. done terminates → done
 *  10. multi-run flush-fix (repair pass aggregation)
 */

import { describe, expect, it } from "vitest";
import { selectVersionStatus } from "./event-bus-projection";
import type { EngineEvent } from "./event-bus-types";

const BASE = {
  runId: "root",
  versionId: "v1",
  chatId: "c1",
};

function ev<T extends EngineEvent["t"]>(
  t: T,
  extra: Omit<Extract<EngineEvent, { t: T }>, "t" | "id" | "ts" | "versionId" | "chatId" | "runId"> &
    Partial<{ id: string; ts: string; runId: string; versionId: string }>,
): Extract<EngineEvent, { t: T }> {
  return {
    t,
    id: extra.id ?? `${t}-${Math.random().toString(36).slice(2, 8)}`,
    ts: extra.ts ?? "2026-04-23T10:00:00.000Z",
    versionId: extra.versionId ?? BASE.versionId,
    chatId: BASE.chatId,
    runId: extra.runId ?? BASE.runId,
    ...(extra as object),
  } as Extract<EngineEvent, { t: T }>;
}

describe("selectVersionStatus", () => {
  it("empty stream projects to idle", () => {
    const status = selectVersionStatus([]);
    expect(status).toEqual({
      runId: null,
      phase: "idle",
      previewBlocked: false,
      verificationBlocked: false,
      repairPassIndex: 0,
      lastBuildError: null,
      eventCount: 0,
      done: false,
      verifierOutcome: null,
      degradations: [],
    });
  });

  it("collects version.degraded events without changing phase", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "Server-verify skipped (design_preview_skip_verify).",
        meta: { reason: "design_preview_skip_verify" },
      }),
      ev("version.degraded", {
        kind: "product_postcheck_skipped",
        message: "F2 Product Postcheck skipped (missing_preview_url).",
        meta: { skippedReason: "missing_preview_url" },
      }),
    ]);
    expect(status.degradations).toHaveLength(2);
    expect(status.degradations.map((d) => d.kind)).toEqual([
      "verifier_skipped_by_policy",
      "product_postcheck_skipped",
    ]);
    // phase still tracks the lifecycle signals, not the degradations.
    expect(status.phase).toBe("streaming");
  });

  it("collapses repeated degraded events of same kind to most recent meta", () => {
    const status = selectVersionStatus([
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "first",
        meta: { reason: "foo" },
      }),
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "second",
        meta: { reason: "bar" },
      }),
    ]);
    expect(status.degradations).toHaveLength(1);
    expect(status.degradations[0]?.message).toBe("second");
  });

  it("clears degradations on a clean version.saved", () => {
    const status = selectVersionStatus([
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "stale skip from earlier pass",
      }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
    ]);
    expect(status.degradations).toEqual([]);
  });

  it("streaming token progress surfaces as streaming", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.stream.tokenProgress", { phase: "output", chars: 1024 }),
    ]);
    expect(status.phase).toBe("streaming");
    expect(status.eventCount).toBe(2);
    expect(status.runId).toBe("root");
  });

  it("clean autofix + syntax + preflight settles on preflighting", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.autofix.result", { fixes: 3, warnings: 0, dependencies: 1 }),
      ev("version.syntax.pass", { pass: 1, errors: 0, phase: "ok" }),
      ev("version.preflight", {
        filesChecked: 42,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
    ]);
    expect(status.phase).toBe("preflighting");
    expect(status.previewBlocked).toBe(false);
    expect(status.verificationBlocked).toBe(false);
  });

  it("preflight blockers project to blocked even with a subsequent idle emit", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.preflight", {
        filesChecked: 10,
        issueCount: 2,
        errorCount: 2,
        warningCount: 0,
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason: "missing-app-shell",
      }),
    ]);
    expect(status.phase).toBe("blocked");
    expect(status.previewBlocked).toBe(true);
    expect(status.verificationBlocked).toBe(true);
  });

  it("verifier failure surfaces as failed", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.preflight", {
        filesChecked: 10,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", {
        outcome: "failed",
        blocked: true,
        findings: [{ id: "build", detail: "npm run build failed" }],
      }),
    ]);
    expect(status.phase).toBe("failed");
    expect(status.verifierOutcome).toBe("failed");
    expect(status.verificationBlocked).toBe(true);
  });

  it("repair started without completion projects to repairing", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.verifier.done", { outcome: "failed", blocked: true }),
      ev("version.repair.started", {
        reason: "quality-gate-failed",
        trigger: "server-verify",
        runId: "repair-1",
      }),
      ev("version.repair.passIndex", { passIndex: 1, runId: "repair-1" }),
    ]);
    expect(status.phase).toBe("repairing");
    expect(status.repairPassIndex).toBe(1);
    expect(status.runId).toBe("repair-1");
  });

  it("repair success clears blockers after clean save", () => {
    const status = selectVersionStatus([
      ev("version.verifier.done", { outcome: "failed", blocked: true }),
      ev("version.repair.started", { reason: "build-error", trigger: "build-error", runId: "repair-1" }),
      ev("version.repair.passIndex", { passIndex: 1, runId: "repair-1" }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
        runId: "repair-1",
      }),
    ]);
    expect(status.phase).toBe("preflighting");
    expect(status.verificationBlocked).toBe(false);
    expect(status.repairPassIndex).toBe(1);
    expect(status.lastBuildError).toBeNull();
  });

  it("build-error at end of stream projects to failed and keeps error", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.preflight", {
        filesChecked: 10,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.build.error", {
        error: { stage: "install", message: "pnpm install failed", failureCode: "EPERM" },
        level: "error",
      }),
    ]);
    expect(status.phase).toBe("failed");
    expect(status.lastBuildError).toEqual({
      stage: "install",
      message: "pnpm install failed",
      failureCode: "EPERM",
    });
    expect(status.verificationBlocked).toBe(true);
  });

  it("`version.done` terminates the stream regardless of prior blockers", () => {
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.preflight", {
        filesChecked: 10,
        issueCount: 5,
        errorCount: 5,
        warningCount: 0,
        previewBlocked: true,
        verificationBlocked: true,
      }),
      ev("version.done", { durationMs: 12345, previewUrl: "https://example.test" }),
    ]);
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
    // Blockers are still reflected — the projection never lies about
    // whether the version was blocked, it just marks the stream as done.
    expect(status.previewBlocked).toBe(true);
  });

  // ── plan-02 / STATUS-02 regression tests ──────────────────────────
  // These lock down the "modal-truth" invariants that smoke-1 confirmed
  // already work in HEAD. They guard against future projection drift
  // where async F3 / non-blocking warnings would silently override a
  // clean F2 finalize and turn the streaming status panel red.

  it("plan-02: design_preview_skip_verify keeps a clean F2 stream out of failed/blocked", () => {
    // Mirrors run-2/run-3 from STATUS-01: F2 finalize emits a clean
    // preflight + saved, then the post-finalize policy emits
    // `version.verifier.done outcome=skipped, reason=design_preview_skip_verify`
    // (see `runOwnEngineStreamPostFinalize`). The projection must
    // not interpret "skipped" as "failed" and must not flip
    // verificationBlocked.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", {
        outcome: "skipped",
        blocked: false,
        reason: "design_preview_skip_verify",
      }),
    ]);
    expect(status.phase).not.toBe("failed");
    expect(status.phase).not.toBe("blocked");
    expect(status.verificationBlocked).toBe(false);
    expect(status.previewBlocked).toBe(false);
    expect(status.verifierOutcome).toBe("skipped");
    expect(status.lastBuildError).toBeNull();
    // False-green contract: this skip-path emits no explicit
    // `version.degraded`, so the projection derives one. A skipped
    // verifier therefore always carries `verifier_skipped_by_policy` and
    // can never surface downstream as degradation-free solid green.
    expect(status.degradations.map((d) => d.kind)).toContain("verifier_skipped_by_policy");
  });

  it("plan-02: warning-level build events do not overshadow a clean F2 finalize", () => {
    // Cross-file-import-checker stubs and other "shippable but hollow"
    // findings flow through the bus as `version.build.error` events
    // with `level: "warning"`. The projection must keep the F2
    // streaming status benign — only `level: "error"` rows are allowed
    // to flip the phase to blocked/failed.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.build.error", {
        error: { stage: "merge:cross-file-stub", message: "1 fil saknades och stubbades" },
        level: "warning",
        category: "merge:cross-file-stub",
      }),
    ]);
    expect(status.phase).not.toBe("failed");
    expect(status.phase).not.toBe("blocked");
    expect(status.verificationBlocked).toBe(false);
    expect(status.lastBuildError).toBeNull();
  });

  it("plan-02: error-level build events still flip the projection to failed", () => {
    // Counter-test: confirm we didn't accidentally neuter the error
    // path. A genuine build failure (no `level` defaults to "error")
    // must still mark the version blocked + failed.
    const status = selectVersionStatus([
      ev("version.started", {}),
      ev("version.preflight", {
        filesChecked: 5,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.build.error", {
        error: { stage: "next-build", message: "TS2305: Module has no exported member 'ButtonProps'" },
      }),
    ]);
    expect(status.phase).toBe("failed");
    expect(status.verificationBlocked).toBe(true);
    expect(status.lastBuildError).toEqual({
      stage: "next-build",
      message: "TS2305: Module has no exported member 'ButtonProps'",
    });
  });

  it("multi-run aggregation (repair-pass flush-fix) preserves every event", () => {
    const status = selectVersionStatus([
      // Original run.
      ev("version.started", { runId: "root" }),
      ev("version.preflight", {
        filesChecked: 10,
        issueCount: 1,
        errorCount: 1,
        warningCount: 0,
        previewBlocked: true,
        verificationBlocked: true,
        runId: "root",
      }),
      ev("version.verifier.done", { outcome: "failed", blocked: true, runId: "root" }),
      // Repair pass — new runId, but same versionId.
      ev("version.repair.started", {
        reason: "quality-gate-failed",
        trigger: "server-verify",
        runId: "repair-1",
      }),
      ev("version.repair.passIndex", { passIndex: 1, runId: "repair-1" }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
        runId: "repair-1",
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false, runId: "repair-1" }),
      ev("version.done", { durationMs: 30_000, runId: "repair-1" }),
    ]);
    // Flush-fix: old timeline-writer would have only kept 2 events in
    // the repair folder. The bus aggregates both runs; done wins.
    expect(status.phase).toBe("done");
    expect(status.eventCount).toBe(8);
    expect(status.repairPassIndex).toBe(1);
    expect(status.verifierOutcome).toBe("passed");
    expect(status.runId).toBe("repair-1");
  });

  // ── terminal-settle regression (no runtime `version.done` emitter) ──
  // The runtime emits the legacy `site.done` devLog row, never the bus
  // `version.done` event, so a successfully completed verifier is the
  // real end-of-stream signal. Without the terminal-settle rule these
  // versions stuck on a non-terminal `verifying` phase forever — which
  // the builder rendered as a perpetual "Verifierar" spinner and hid the
  // promoted release-state.
  it("F3 success path (verifier passed, no version.done) settles to done", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false }),
    ]);
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
    expect(status.verifierOutcome).toBe("passed");
    expect(status.degradations).toEqual([]);
  });

  it("F2 design-skip path (verifier skipped + degraded, no version.done) settles to done", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", {
        outcome: "skipped",
        blocked: false,
        reason: "design_preview_skip_verify",
      }),
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "Server-verify skipped (design_preview_skip_verify).",
      }),
    ]);
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
    // Degradations survive terminal-settle — the false-green guard maps
    // this `done` to `degraded`, never solid success.
    expect(status.degradations.map((d) => d.kind)).toEqual(["verifier_skipped_by_policy"]);
  });

  it("false-green contract: skipped verifier WITHOUT an explicit version.degraded still surfaces a derived degradation", () => {
    // Contrast to the F2 design-skip path above: here the runtime emits
    // `version.verifier.done {skipped}` but NO matching `version.degraded`
    // event. The projection must derive `verifier_skipped_by_policy` itself
    // so a skipped verifier can never reach the UI as a degradation-free
    // (solid-green) success — the false-green contract is locked at the
    // source, not just in the display mapper.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", {
        outcome: "skipped",
        blocked: false,
        reason: "design_preview_skip_verify",
      }),
    ]);
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
    expect(status.degradations.map((d) => d.kind)).toContain("verifier_skipped_by_policy");
  });

  it("does NOT settle to done before the verifier has completed", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
    ]);
    expect(status.phase).toBe("preflighting");
    expect(status.done).toBe(false);
  });

  it("a verifier that passed but left preview blocked stays blocked (not done)", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 1,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: true,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false }),
    ]);
    expect(status.phase).toBe("blocked");
    expect(status.done).toBe(false);
  });

  // ── stale-verifierOutcome gate (Codex P2 / VADE logic) ──────────────
  // Terminal-settle must only fire when verifier-completion is the LATEST
  // phase signal. A repair pass that emits a fresh clean `preflight` after
  // an earlier `verifier.done` must NOT settle the version `done` on the
  // stale outcome — that would stop polling and show a false "klart" mid
  // repair, before the repair pass's own verifier has reported.
  it("repair efter passed verifier settlar inte done på stale outcome", () => {
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false }),
      ev("version.repair.started", {
        reason: "quality-gate-failed",
        trigger: "server-verify",
        runId: "repair-1",
      }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
        runId: "repair-1",
      }),
    ]);
    expect(status.phase).not.toBe("done");
    expect(status.done).toBe(false);
  });

  it("ny verifier-done efter repair settlar done igen", () => {
    // Bevisar att gaten ÖPPNAR korrekt: när repair-passets egen verifierare
    // rapporterar (verifier-completion blir åter den senaste fas-signalen)
    // ska terminal-settle fyra och versionen bli `done`.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false }),
      ev("version.repair.started", {
        reason: "quality-gate-failed",
        trigger: "server-verify",
        runId: "repair-1",
      }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
        runId: "repair-1",
      }),
      ev("version.verifier.done", { outcome: "passed", blocked: false, runId: "repair-1" }),
    ]);
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
  });
});
