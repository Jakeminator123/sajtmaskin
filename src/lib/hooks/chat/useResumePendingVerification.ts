"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

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
 * F2 verification, but ANY later builder visit resumes a stranded lane by
 * re-posting `/quality-gate` for the latest resumable row. Safety properties:
 *
 *  - Age gate ({@link RESUME_VERIFY_MIN_AGE_MS}): a row younger than this is
 *    assumed to have its original post-stream lane still running — we never
 *    race it.
 *  - The route's per-version lease makes a duplicate POST harmless (409
 *    `version_busy`), so two tabs can't double-verify.
 *  - Only the LATEST engine row is considered; the route itself marks
 *    superseded rows instead of mutating stale heads.
 *  - F3 (`integrations`) rows are excluded — server-verify owns those and the
 *    watchdog already settles them. `quick_edit` minor versions are excluded
 *    (deterministic edits, not gate-promoted).
 *  - One attempt per versionId per mount; a hard gate fail settles the row
 *    terminally server-side, so there is no retry loop to cap.
 */

/**
 * Minimum age before a `draft`/`pending` row counts as stranded. The normal
 * post-stream lane finishes well under this (observed ~70–120 s including
 * image validation + product-postcheck), so anything older has no live owner.
 */
export const RESUME_VERIFY_MIN_AGE_MS = 3 * 60_000;

type ResumableVersionRow = {
  id?: string | null;
  versionId?: string | null;
  releaseState?: string | null;
  verificationState?: string | null;
  lifecycleStage?: string | null;
  editKind?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
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
 * Pure selector: the versionId of a stranded F2 draft to resume, or null.
 * Exported separately so the trigger conditions are unit-testable without DOM.
 */
export function findResumablePendingVersion(
  versions: unknown,
  nowMs: number,
): string | null {
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
  if (latest.editKind === "quick_edit") return null;

  if (!latest.createdAt) return null;
  const createdMs =
    latest.createdAt instanceof Date
      ? latest.createdAt.getTime()
      : Date.parse(String(latest.createdAt));
  if (!Number.isFinite(createdMs)) return null;
  if (nowMs - createdMs < RESUME_VERIFY_MIN_AGE_MS) return null;

  return versionId;
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
    const versionId = findResumablePendingVersion(versions, Date.now());
    if (!versionId || attemptedRef.current.has(versionId)) return;
    attemptedRef.current.add(versionId);

    let cancelled = false;
    toast.message("Återupptar verifiering", {
      description:
        "Senaste versionen blev aldrig färdigverifierad — kör verifieringen igen i bakgrunden.",
    });

    void (async () => {
      try {
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
        if (cancelled) return;
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

    return () => {
      cancelled = true;
    };
    // `mutateVersions` in deps is safe: attemptedRef dedupes per versionId,
    // so an identity change can never re-POST for the same version.
  }, [chatId, versions, isStreaming, mutateVersions]);
}
