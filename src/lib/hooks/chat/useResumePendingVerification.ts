"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { buildProductPostcheckLogItems, persistVersionErrorLogs } from "./post-checks";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

/**
 * Resume of the browser-driven F2 verify lane for stranded draft versions.
 *
 * F2 (design) versions are promoted by the CLIENT: after a generation stream
 * ends, `runPostGenerationChecks` → `runTier2VerifyLane` → `POST /quality-gate`
 * runs in the browser and the route promotes the version. Server-side
 * verification is intentionally skipped for F2 (`design_preview_skip_verify`)
 * and the stale-verification watchdog deliberately never touches F2 `pending`
 * rows (a valid design preview must not be false-red:ed by age alone).
 *
 * Consequence before this hook: if the tab was closed / navigated / reloaded
 * inside the ~1–2 min window after finalize, the version stayed
 * `draft`/`pending` FOREVER — generation succeeded, preview ran, but the row
 * never turned green and nothing ever retried (prod chat 4314362f,
 * 2026-07-02).
 *
 * This hook closes the gap without moving ownership: the browser still drives
 * F2 verification, but ANY later builder visit resumes a stranded lane. The
 * resume mirrors the tail of the normal lane (Codex P1+P2 rounds on #353):
 * `POST /validate-images` (auto-replacement of broken image URLs) →
 * `POST /product-postcheck` (emits `version.degraded` server-side for
 * skipped/blocked DOM checks AND its result is persisted to `/error-log` as
 * `product_postcheck.summary` — the row `PreviewPanelF3Trigger` reads to
 * block F3) → `POST /quality-gate`. A `productBlocked` result does NOT stop
 * the gate: normal-lane parity records it as a warning and still verifies,
 * so the row settles (promoted-with-degradation or failed) instead of
 * staying pending forever — the F3 block is enforced via the persisted
 * summary log, not by leaving the version unverified.
 *
 * Safety properties:
 *
 *  - Age gate ({@link RESUME_VERIFY_MIN_AGE_MS}): a row younger than this is
 *    assumed to have its original post-stream lane still running — we never
 *    race it. {@link RESUME_VERIFY_MAX_AGE_MS} bounds the other end so old
 *    historical drafts (from before provenance markers existed) are never
 *    retroactively promoted on a random builder visit (Codex P2 on #353).
 *  - Provenance gate: only rows with `editKind == null` (normal generated
 *    versions) are resumable. `quick_edit`, `imported_repo` (template/ZIP/
 *    GitHub imports) and `restore` rows never had a browser post-check lane
 *    and must not be gate-promoted or false-red:ed by one.
 *  - The route's per-version lease makes a duplicate POST harmless (409
 *    `version_busy`), so two tabs can't double-verify.
 *  - Only the LATEST engine row is considered; the route itself marks
 *    superseded rows instead of mutating stale heads.
 *  - F3 (`integrations`) rows are excluded — server-verify owns those and the
 *    watchdog already settles them.
 *  - One attempt per versionId per mount; a hard gate fail settles the row
 *    terminally server-side, so there is no retry loop to cap.
 */

/**
 * Minimum age before a `draft`/`pending` row counts as stranded. The normal
 * post-stream lane finishes well under this (observed ~70–120 s including
 * image validation + product-postcheck), so anything older has no live owner.
 */
export const RESUME_VERIFY_MIN_AGE_MS = 3 * 60_000;

/**
 * Upper bound for resumability. Rows older than this are stale history —
 * auto-promoting them has no UX value, and rows created before the
 * import/restore provenance markers existed (editKind null) must not be
 * retroactively gate-promoted long after the fact.
 */
export const RESUME_VERIFY_MAX_AGE_MS = 24 * 60 * 60_000;

type ResumableVersionRow = {
  id?: string | null;
  versionId?: string | null;
  releaseState?: string | null;
  verificationState?: string | null;
  lifecycleStage?: string | null;
  editKind?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
  previewUrl?: string | null;
};

export type ResumablePendingVersion = {
  versionId: string;
  /** Persisted live-preview URL for the row (feeds product-postcheck), if any. */
  previewUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Mirrors VersionHistory's sort key: prefer versionNumber, else createdAt. */
function rowSortKey(row: ResumableVersionRow): number {
  if (typeof row.versionNumber === "number" && Number.isFinite(row.versionNumber)) {
    return row.versionNumber;
  }
  if (!row.createdAt) return 0;
  const ts =
    row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt));
  return Number.isFinite(ts) ? ts : 0;
}

function rowVersionId(row: ResumableVersionRow): string | null {
  if (typeof row.id === "string" && row.id.trim()) return row.id;
  if (typeof row.versionId === "string" && row.versionId.trim()) return row.versionId;
  return null;
}

/**
 * Pure selector: the stranded F2 draft to resume, or null.
 * Exported separately so the trigger conditions are unit-testable without DOM.
 */
export function findResumablePendingVersion(
  versions: unknown,
  nowMs: number,
): ResumablePendingVersion | null {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const rows = versions.filter(isRecord) as ResumableVersionRow[];
  if (rows.length === 0) return null;

  // Only the latest row is a resume candidate — older pending rows are
  // superseded history, and the gate route would just mark them as such.
  const latest = rows.reduce((best, row) =>
    rowSortKey(row) > rowSortKey(best) ? row : best,
  );

  const versionId = rowVersionId(latest);
  if (!versionId) return null;
  // Legacy/mapped rows have no releaseState at all — never touch those.
  if (latest.releaseState !== "draft") return null;
  if (latest.verificationState !== "pending") return null;
  // F3 rows are server-verify-owned (watchdog settles them); missing stage
  // defaults to design, matching `resolveEngineVersionLifecycleStage`.
  if (latest.lifecycleStage === "integrations") return null;
  // Provenance gate (Codex P2): only normal generated rows (editKind null)
  // ever had a browser post-check lane. quick_edit / imported_repo / restore
  // rows must not be gate-promoted or false-red:ed by a resume.
  if (latest.editKind != null) return null;

  if (!latest.createdAt) return null;
  const createdMs =
    latest.createdAt instanceof Date
      ? latest.createdAt.getTime()
      : Date.parse(String(latest.createdAt));
  if (!Number.isFinite(createdMs)) return null;
  const ageMs = nowMs - createdMs;
  if (ageMs < RESUME_VERIFY_MIN_AGE_MS) return null;
  if (ageMs > RESUME_VERIFY_MAX_AGE_MS) return null;

  return {
    versionId,
    previewUrl:
      typeof latest.previewUrl === "string" && latest.previewUrl.trim()
        ? latest.previewUrl.trim()
        : null,
  };
}

/**
 * Best-effort mirror of the normal lane's image-validation step (broken
 * external image URLs get auto-replaced + persisted server-side via
 * `autoFix: true` before the version is promoted). Transport failures are
 * swallowed — the normal lane also proceeds when `validateImages` yields
 * null (Codex P2 round 2 on #353).
 */
async function runResumeImageValidation(params: {
  chatId: string;
  versionId: string;
}): Promise<void> {
  try {
    await fetch(`${engineChatBaseUrl(params.chatId)}/validate-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: params.versionId, autoFix: true }),
    });
  } catch {
    // Best-effort parity step only.
  }
}

/**
 * Best-effort mirror of the normal lane's product-postcheck step. Returns
 * `{ productBlocked }`; a network/parse failure returns `productBlocked:false`
 * (same as the normal lane, which continues to the verify lane when
 * `runProductPostcheckApi` yields null). Two truth surfaces are fed here
 * (Codex P1 round 2 on #353): the route emits `version.degraded` bus events,
 * and the full result is persisted to `/error-log` — including the
 * `product_postcheck.summary` row whose `meta.productBlocked` is what
 * `PreviewPanelF3Trigger` reads to block "Bygg integrationer" (F3).
 */
async function runResumeProductPostcheck(params: {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
}): Promise<{ productBlocked: boolean }> {
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/product-postcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: params.versionId, previewUrl: params.previewUrl }),
    });
    if (!res.ok) return { productBlocked: false };
    const data = (await res.json().catch(() => null)) as ProductPostcheckResult | null;
    if (data) {
      // Normal-lane parity: persist the postcheck result as error-log rows.
      // Without the summary row, a product-blocked resume would be liftable
      // to F3 after reload (the F3 trigger reads /error-log, not the bus).
      await persistVersionErrorLogs({
        chatId: params.chatId,
        versionId: params.versionId,
        logs: buildProductPostcheckLogItems(data),
      });
    }
    return { productBlocked: data?.productBlocked === true };
  } catch {
    return { productBlocked: false };
  }
}

export function useResumePendingVerification(params: {
  chatId: string | null;
  versions: unknown[];
  /** True while any message in this tab is streaming — never resume mid-run. */
  isStreaming: boolean;
  mutateVersions?: () => void | Promise<unknown>;
}) {
  const { chatId, versions, isStreaming, mutateVersions } = params;
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!chatId || isStreaming) return;
    const candidate = findResumablePendingVersion(versions, Date.now());
    if (!candidate || attemptedRef.current.has(candidate.versionId)) return;
    attemptedRef.current.add(candidate.versionId);
    const { versionId, previewUrl } = candidate;

    toast.message("Återupptar verifiering", {
      description:
        "Senaste versionen blev aldrig färdigverifierad — kör verifieringen igen i bakgrunden.",
    });

    // Deliberately NO cancellation (Bugbot HIGH on #353): this effect re-runs
    // on every `versions` identity change (SWR idle-polls /versions every
    // 60 s), so a cleanup-driven `cancelled` flag would abort the lane
    // mid-chain on the first poll tick while `attemptedRef` blocks any retry
    // for the rest of the session — stranding the row again. Every step below
    // is safe to run to completion past unmount/re-render: the POSTs are
    // idempotent + lease-protected server-side, `toast` is app-global, and
    // SWR's `mutateVersions` is cache-scoped, not component-scoped.
    void (async () => {
      try {
        // Step 1 — image validation (broken external image URLs get
        // auto-replaced + persisted before promote), normal-lane parity
        // (Codex P2 round 2).
        await runResumeImageValidation({ chatId, versionId });

        // Step 2 — product-postcheck, mirroring the normal lane order. The
        // route emits `version.degraded` server-side AND the result is
        // persisted as `/error-log` rows (incl. `product_postcheck.summary`,
        // the row the F3 trigger enforces) so a resumed promotion can never
        // read as solid green without DOM verification (Codex P1 rounds 1+2).
        const postcheck = await runResumeProductPostcheck({ chatId, versionId, previewUrl });
        if (postcheck.productBlocked) {
          // Normal-lane parity (Codex P2 round 2): the normal post-check path
          // records productBlocked as a warning and STILL runs the verify
          // lane, so the row settles (promoted-with-degradation or failed)
          // instead of staying draft/pending forever — the F3 lift is blocked
          // by the persisted summary row, not by leaving the row unverified.
          toast.message("Produktkontrollen hittade blockerande fel", {
            description:
              "Fynden loggades och blockerar 'Bygg integrationer' (F3). Verifieringen körs ändå klart.",
          });
        }

        // Step 3 — quality gate (verify + promote).
        const res = await fetch(`${engineChatBaseUrl(chatId)}/quality-gate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No `checks`: the route defaults to the canonical F2 design lane
          // and force-upgrades F3 rows server-side anyway.
          body: JSON.stringify({ versionId }),
        });
        const data = (await res.json().catch(() => null)) as {
          passed?: boolean;
          superseded?: boolean;
          designAdvisory?: boolean;
          promoteError?: boolean;
          promotionBlocked?: boolean;
        } | null;
        await Promise.resolve(mutateVersions?.());

        // Non-200s are all non-actionable here: 409 = another job holds the
        // lease (it will finish the work), 501/503 = verify lane not
        // configured/unreachable, 404 = version/chat scope mismatch. Stay
        // quiet; the version list refetch above keeps the UI honest.
        if (!res.ok || !data || data.superseded) return;

        if (data.passed) {
          toast.success(
            data.designAdvisory
              ? "Versionen verifierades och publicerades (med typecheck-varningar)."
              : "Versionen verifierades och publicerades.",
          );
        } else if (data.promoteError || data.promotionBlocked) {
          toast.message("Verifieringen gick inte att slutföra", {
            description:
              "Byggkontrollerna kördes men versionen kunde inte publiceras. Öppna diagnostik-dialogen för detaljer.",
          });
        } else {
          toast.message("Verifieringen hittade fel", {
            description:
              "Versionen markerades som ej godkänd. Öppna diagnostik-dialogen för detaljer.",
          });
        }
      } catch {
        // Best-effort resume: network failures leave the row pending and a
        // later builder visit gets a fresh attempt (new mount → new ref set).
      }
    })();
    // `mutateVersions` in deps is safe: attemptedRef dedupes per versionId,
    // so an identity change can never re-POST for the same version.
  }, [chatId, versions, isStreaming, mutateVersions]);
}
