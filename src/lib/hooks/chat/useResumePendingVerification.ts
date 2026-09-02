"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  buildProductPostcheckLogItems,
  hasActivePostCheck,
  imageValidationHoldCategory,
  imageValidationHoldMessage,
  interpretValidateImagesHttp,
  persistVersionErrorLogs,
  productPostcheckResultFromUnavailableHttp,
  shouldHoldBeforeProductPostcheck,
} from "./post-checks";
import type { ImageValidationResult } from "./post-checks-results";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";
import { isNonFinalProductPostcheckSkipReason } from "@/lib/gen/verify/product-postcheck-skip";
import { parseRetryAfterMs } from "@/lib/builder/preview-bootstrap-retry";

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
 *  - Provenance gate: rows with `editKind == null` (normal generated
 *    versions) resume the normal lane, and `imported_repo` rows (template/
 *    ZIP/GitHub imports) run a dedicated IMPORT lane (see below).
 *    `quick_edit` and `restore` rows are intentional user drafts with no
 *    verification lane and must not be gate-promoted or false-red:ed by one.
 *
 * Import-verification lane (`lane: "imported"`, 2026-08-18): an imported repo
 * version historically had NO verification lifecycle at all — `POST
 * /api/template` (and ZIP/GitHub `/init`) creates the draft/pending row,
 * boots the preview and stops, so the base version stayed "Ej verifierad"
 * forever. This lane closes that gap by reusing the exact machinery above,
 * with two differences:
 *
 *  - **No `/validate-images` step.** Its `autoFix: true` mutates files, and
 *    an imported repo is a verbatim contract — the import must never be
 *    silently rewritten by a verification pass.
 *  - **Shorter min-age gate** ({@link RESUME_VERIFY_IMPORT_MIN_AGE_MS}):
 *    there is no original post-stream lane to race — the gate only gives the
 *    server-side preview boot (~30–90 s cold start) a head start. A candidate
 *    that is merely too young self-schedules a re-check for the moment the
 *    gate opens (see `ageGateNonce`), and a cold runtime holds the lane at a
 *    `/preview-status` probe before any DOM postcheck (see step 2b).
 *
 *    The quality-gate route already handles verbatim repos
 *    (`chatUsesVerbatimRepo` → `buildExportableProject({ verbatimRepo })`),
 *    the promote-guard is deliberately fail-open for no-telemetry imports,
 *    and the F2 lane's `isTypecheckOnlyAdvisory` maps the outcomes honestly:
 *    clean typecheck → promoted ("Verifierad"), advisory-safe TS errors →
 *    promoted with warnings, render-risk/install failures → failed.
 *  - The route's per-version lease makes a duplicate POST harmless (409
 *    `version_busy`), so two tabs can't double-verify.
 *  - Only the LATEST engine row is considered; the route itself marks
 *    superseded rows instead of mutating stale heads.
 *  - F3 (`integrations`) rows are excluded — server-verify owns those and the
 *    watchdog already settles them.
 *  - Preview precondition: a row without a persisted `previewUrl` gets a
 *    `POST /preview-session` rehydration first (also persists the URL); an
 *    unbootable preview HOLDS the resume — the normal lane never verifies a
 *    version without a live preview (Codex P1 round 4).
 *  - Fail-closed blocker persistence: a `productBlocked` result whose
 *    `/error-log` write cannot be verified holds the resume — the summary row
 *    is the surface both the F3 button and `/finalize-design` enforce.
 *  - Bounded retries ({@link RESUME_VERIFY_MAX_ATTEMPTS}): transient holds
 *    (stale lease 409, verify lane 5xx, unbootable preview, blocker-persist
 *    failure) leave the remaining slots open for later poll ticks; a
 *    completed gate or 404 consumes all slots. Import-lane runtime holds
 *    (`starting` / `version_mismatch` / `stopped` / `missing`) refund the
 *    slot and self-schedule via {@link RESUME_VERIFY_RUNTIME_RETRY_MS}
 *    instead of charging the budget — a quiet chat's `/versions` payload
 *    stays deep-equal across SWR polls, so the effect would otherwise never
 *    re-run after the age gate has opened. Runtime-only waits are capped
 *    separately ({@link RESUME_VERIFY_MAX_RUNTIME_WAITS}); past that cap
 *    the lane consumes the verification budget and stops (no DOM postcheck
 *    of a boot page). A hard gate fail settles the row terminally
 *    server-side — the resume lane deliberately does NOT open a new
 *    server-repair entry point (repair-gate rule); repair stays in the
 *    normal diagnostics/repair UI.
 */

/**
 * Minimum age before a `draft`/`pending` row counts as stranded. Höjd från
 * 3 till 5 min 2026-09-01: #1221 lät normala lanen vänta in en bootande
 * preview i upp till 150 s FÖRE capture, så dess ärliga världstid är
 * ~70–120 s + väntan ≈ upp till ~4,5 min. Med 3-minutersgränsen startade
 * resume-lanen rutinmässigt mitt i en levande lane (dubbla Chromium-launcher,
 * prod 2026-09-01 chattar c2371f9c/3b9ca137). Samma flik skyddas dessutom av
 * `hasActivePostCheck`-vakten i effekten nedan.
 */
export const RESUME_VERIFY_MIN_AGE_MS = 5 * 60_000;

/**
 * Minimum age for an `imported_repo` row before the import-verification lane
 * runs. Imports never had an original post-stream lane, so there is nothing
 * to race — this gate only lets the server-side preview boot (~30–90 s cold
 * start) finish first so product-postcheck usually gets a live URL without a
 * rehydration round-trip.
 */
export const RESUME_VERIFY_IMPORT_MIN_AGE_MS = 90_000;

/**
 * Upper bound for resumability. Rows older than this are stale history —
 * auto-promoting them has no UX value, and rows created before the
 * import/restore provenance markers existed (editKind null) must not be
 * retroactively gate-promoted long after the fact.
 *
 * 7 days (was 24 h until 2026-08-31, ägarbeslut): prod chat 3e982c00 showed
 * the realistic stranded case — a follow-up version whose tab closed before
 * the gate ran, in a chat nobody reopened the same day. Users routinely come
 * back to a project days later; a 24 h window silently expired the repair
 * before that. The legacy-row concern above is unaffected: pre-provenance
 * rows are months old and only ever get older, so they stay far outside any
 * 7-day window.
 */
export const RESUME_VERIFY_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Attempts per version per builder session (Codex P2 round 4): a transient
 * hold — stale lease 409, verify lane 503, blocker-persist failure, missing
 * preview that could not be rehydrated — leaves the attempt slot open so a
 * later `versions` poll tick retries, instead of stranding the row until a
 * manual reload. Terminal outcomes (gate completed, 404 scope mismatch)
 * consume all slots. Retries are naturally ~60 s apart (the /versions poll).
 */
export const RESUME_VERIFY_MAX_ATTEMPTS = 3;

/**
 * Backoff between import-lane runtime holds (`starting`, `version_mismatch`,
 * `stopped`, `missing`). Reuses the age-gate nonce so a quiet chat whose
 * `/versions` payload stays deep-equal still re-evaluates after the probe.
 */
export const RESUME_VERIFY_RUNTIME_RETRY_MS = 8_000;

/**
 * Cap on import-lane runtime-only waits. After this many holds the lane
 * consumes the verification budget and stops probing — a dead VM must not
 * be DOM-postchecked as a boot page forever.
 */
export const RESUME_VERIFY_MAX_RUNTIME_WAITS = 20;

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
  /**
   * Which verification lane owns the resume: `"generated"` = the normal
   * stranded-F2 lane (editKind null), `"imported"` = the import-verification
   * lane for `imported_repo` rows (no image validation, shorter age gate).
   */
  lane: "generated" | "imported";
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

type ResumeCandidateResolution = {
  candidate: ResumablePendingVersion | null;
  /**
   * When the latest row fails ONLY its lane's min-age gate: the absolute ms
   * timestamp at which it becomes eligible. The hook self-schedules a re-check
   * for this moment — SWR keeps deep-equal `/versions` payloads referentially
   * stable, so a quiet chat (typical right after a template import) would
   * otherwise never re-run the effect and the row would stay pending until
   * the next full builder visit (pr-ai-review F-285e977ed706 on #1027).
   */
  eligibleAtMs: number | null;
};

function resolveResumeCandidate(versions: unknown, nowMs: number): ResumeCandidateResolution {
  const none: ResumeCandidateResolution = { candidate: null, eligibleAtMs: null };
  if (!Array.isArray(versions) || versions.length === 0) return none;
  const rows = versions.filter(isRecord) as ResumableVersionRow[];
  if (rows.length === 0) return none;

  // Only the latest row is a resume candidate — older pending rows are
  // superseded history, and the gate route would just mark them as such.
  const latest = rows.reduce((best, row) =>
    rowSortKey(row) > rowSortKey(best) ? row : best,
  );

  const versionId = rowVersionId(latest);
  if (!versionId) return none;
  // Legacy/mapped rows have no releaseState at all — never touch those.
  if (latest.releaseState !== "draft") return none;
  if (latest.verificationState !== "pending") return none;
  // F3 rows are server-verify-owned (watchdog settles them); missing stage
  // defaults to design, matching `resolveEngineVersionLifecycleStage`.
  if (latest.lifecycleStage === "integrations") return none;
  // Provenance gate (Codex P2 + import lane 2026-08-18): normal generated
  // rows (editKind null) resume the stranded-F2 lane; `imported_repo` rows
  // run the import-verification lane (they NEVER had any lane, so the base
  // version stayed pending forever). quick_edit / restore / unknown future
  // provenances are intentional drafts and must not be gate-promoted or
  // false-red:ed by a resume.
  const lane: ResumablePendingVersion["lane"] | null =
    latest.editKind == null
      ? "generated"
      : latest.editKind === "imported_repo"
        ? "imported"
        : null;
  if (!lane) return none;

  if (!latest.createdAt) return none;
  const createdMs =
    latest.createdAt instanceof Date
      ? latest.createdAt.getTime()
      : Date.parse(String(latest.createdAt));
  if (!Number.isFinite(createdMs)) return none;
  const ageMs = nowMs - createdMs;
  if (ageMs > RESUME_VERIFY_MAX_AGE_MS) return none;
  const minAgeMs =
    lane === "imported" ? RESUME_VERIFY_IMPORT_MIN_AGE_MS : RESUME_VERIFY_MIN_AGE_MS;
  if (ageMs < minAgeMs) {
    return { candidate: null, eligibleAtMs: createdMs + minAgeMs };
  }

  return {
    candidate: {
      versionId,
      previewUrl:
        typeof latest.previewUrl === "string" && latest.previewUrl.trim()
          ? latest.previewUrl.trim()
          : null,
      lane,
    },
    eligibleAtMs: null,
  };
}

/**
 * Pure selector: the stranded F2 draft (or imported base version) to resume,
 * or null. Exported separately so the trigger conditions are unit-testable
 * without DOM.
 */
export function findResumablePendingVersion(
  versions: unknown,
  nowMs: number,
): ResumablePendingVersion | null {
  return resolveResumeCandidate(versions, nowMs).candidate;
}

/**
 * Pure companion to {@link findResumablePendingVersion}: when the latest row
 * is a valid candidate that only fails its lane's min-age gate, returns the
 * absolute ms timestamp at which it becomes eligible; otherwise null.
 */
export function findResumeEligibleAtMs(versions: unknown, nowMs: number): number | null {
  return resolveResumeCandidate(versions, nowMs).eligibleAtMs;
}

/**
 * Same `interpretValidateImagesHttp` + `shouldHoldBeforeProductPostcheck`
 * contract as the normal tail (L3): 404 continues, 409/5xx and
 * replaced-without-persisted hold, persisted revision is pinned.
 */
async function runResumeImageValidation(params: {
  chatId: string;
  versionId: string;
}): Promise<{
  proceed: boolean;
  filesRevision: string | null;
  persistedMutation: boolean;
  hold?: ImageValidationResult | null;
}> {
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/validate-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: params.versionId, autoFix: true }),
    });
    const body = (await res.json().catch(() => null)) as ImageValidationResult | null;
    const data = res.ok ? body : interpretValidateImagesHttp(res.status, body);
    if (shouldHoldBeforeProductPostcheck(data)) {
      return { proceed: false, filesRevision: null, persistedMutation: false, hold: data };
    }
    const filesRevision =
      typeof data?.filesRevision === "string" && data.filesRevision.trim()
        ? data.filesRevision.trim()
        : null;
    const persistedMutation =
      (data?.replacedCount ?? 0) > 0 &&
      data?.persisted === true &&
      Boolean(filesRevision);
    return { proceed: true, filesRevision, persistedMutation };
  } catch {
    const hold = interpretValidateImagesHttp(0, null);
    return { proceed: false, filesRevision: null, persistedMutation: false, hold };
  }
}

/**
 * Rehydrate a live preview for a stranded row that has no persisted
 * `previewUrl` (e.g. historical rows from the fire-and-forget persist
 * incident). The normal lane never gates a version without a preview
 * (missing preview = readiness failure), so the resume lane must not either
 * (Codex P1 round 4) — `POST /preview-session` boots/resumes the VM for the
 * version AND persists the preview URL server-side. Returns the live URL or
 * null (→ caller holds the resume as retryable).
 */
async function rehydratePreviewUrl(params: {
  chatId: string;
  versionId: string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/preview-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: params.versionId }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { previewUrl?: unknown } | null;
    return typeof data?.previewUrl === "string" && data.previewUrl.trim()
      ? data.previewUrl.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Live preview-runtime status for the import lane's cold-boot gate (Bugbot
 * medium on #1027): the import route persists a `previewUrl` while the VM may
 * still be installing, so a DOM product-postcheck at the age gate could hit
 * the boot page, persist a `productBlocked` summary (sticky F3 block) and
 * still promote — a transient cold start misread as a product failure. The
 * lane therefore probes `GET /preview-status` first and only postchecks a
 * runtime that answered `running` (or settled as `build_error`, a stable
 * verdict). Returns the status string, or null on transport/parse failure.
 */
type PreviewMismatchDirection = "session_newer" | "session_older" | "unknown";

type PreviewRuntimeProbe = {
  status: string | null;
  mismatchDirection?: PreviewMismatchDirection;
};

function asMismatchDirection(value: unknown): PreviewMismatchDirection | undefined {
  if (value === "session_newer" || value === "session_older" || value === "unknown") {
    return value;
  }
  return undefined;
}

async function fetchPreviewRuntimeStatus(params: {
  chatId: string;
  versionId: string;
}): Promise<PreviewRuntimeProbe> {
  try {
    const res = await fetch(
      `${engineChatBaseUrl(params.chatId)}/preview-status?versionId=${encodeURIComponent(params.versionId)}`,
    );
    if (!res.ok) return { status: null };
    const data = (await res.json().catch(() => null)) as {
      status?: unknown;
      mismatchDirection?: unknown;
    } | null;
    return {
      status: typeof data?.status === "string" ? data.status : null,
      mismatchDirection: asMismatchDirection(data?.mismatchDirection),
    };
  } catch {
    return { status: null };
  }
}

/**
 * Best-effort mirror of the normal lane's product-postcheck step. A
 * network/parse failure returns `productBlocked:false` (same as the normal
 * lane, which continues to the verify lane when `runProductPostcheckApi`
 * yields null). Two truth surfaces are fed here (Codex P1 round 2 on #353):
 * the route emits `version.degraded` bus events, and the full result is
 * persisted to `/error-log` — including the `product_postcheck.summary` row
 * whose `meta.productBlocked` is what `PreviewPanelF3Trigger` reads (and
 * `/finalize-design` enforces server-side) to block F3. `blockerPersistFailed`
 * is true when the result was productBlocked but the log write could not be
 * verified — the caller must then HOLD the resume instead of promoting a
 * version whose blocker never reached the enforcement surface (Codex P1
 * round 4).
 */
async function runResumeProductPostcheck(params: {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
  filesRevision?: string | null;
}): Promise<{
  productBlocked: boolean;
  blockerPersistFailed: boolean;
  superseded: boolean;
  pendingHold: boolean;
  alreadySettled: boolean;
  retryAfterMs: number | null;
}> {
  const idle = {
    productBlocked: false,
    blockerPersistFailed: false,
    superseded: false,
    pendingHold: false,
    alreadySettled: false,
    retryAfterMs: null as number | null,
  };
  let data: ProductPostcheckResult | null = null;
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/product-postcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: params.versionId,
        previewUrl: params.previewUrl,
        ...(params.filesRevision ? { filesRevision: params.filesRevision } : {}),
      }),
    });
    if (res.ok) {
      data = (await res.json().catch(() => null)) as ProductPostcheckResult | null;
    } else {
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        skippedReason?: string;
      } | null;
      const unavailable = productPostcheckResultFromUnavailableHttp({
        status: res.status,
        code: body?.code,
        skippedReason: body?.skippedReason,
        previewUrl: params.previewUrl,
      });
      if (unavailable) {
        return {
          ...idle,
          pendingHold: true,
          retryAfterMs: parseRetryAfterMs(res.headers, RESUME_VERIFY_RUNTIME_RETRY_MS),
        };
      }
    }
  } catch {
    // Persist the transport-level degradation below, then retry. Promoting on
    // an absent response would create the exact false-green this lane repairs.
  }
  if (!data) {
    await persistVersionErrorLogs({
      chatId: params.chatId,
      versionId: params.versionId,
      logs: buildProductPostcheckLogItems(null),
    });
    return { ...idle, superseded: true };
  }
  if (data.skippedReason === "preview_superseded") {
    return { ...idle, superseded: true };
  }
  if (isNonFinalProductPostcheckSkipReason(data.skippedReason)) {
    return { ...idle, pendingHold: true };
  }
  if (data.skippedReason === "claim_settled") {
    return { ...idle, alreadySettled: true };
  }
  if (data.skippedReason !== "feature_disabled" && !data.attestation) {
    // A current route response is always attested. Treat an older/unscoped
    // response as a retryable hold instead of promoting without durable proof.
    return { ...idle, superseded: true };
  }
  // Normal-lane parity: persist both a concrete result and a missing/transport
  // result. Without the summary row, a product-blocked resume would be
  // liftable to F3 after reload; without the transport row, the version would
  // read as fully verified although DOM verification never produced a result.
  const persisted = await persistVersionErrorLogs({
    chatId: params.chatId,
    versionId: params.versionId,
    logs: buildProductPostcheckLogItems(data),
    productPostcheckAttestation: data?.attestation ?? null,
  });
  const productBlocked = data?.productBlocked === true;
  return {
    ...idle,
    productBlocked,
    blockerPersistFailed: productBlocked && !persisted,
  };
}

export function useResumePendingVerification(params: {
  chatId: string | null;
  versions: unknown[];
  /** True while any message in this tab is streaming — never resume mid-run. */
  isStreaming: boolean;
  mutateVersions?: () => void | Promise<unknown>;
  /**
   * Bumps `useVersionStatus`'s refreshNonce after the resumed gate settles —
   * normal-lane parity (Codex P2 round 3 on #353): `/versions` refetch alone
   * updates VersionHistory but the active preview badge polls `/version-status`
   * and may have gone idle on a bus-settled `done` before the resume ran.
   */
  onVersionStatusRefresh?: () => void;
}) {
  const { chatId, versions, isStreaming, mutateVersions, onVersionStatusRefresh } = params;
  // versionId → attempts used. A run in flight always holds a slot; retryable
  // holds leave remaining slots open for a later /versions poll tick, terminal
  // outcomes consume all slots (Codex P2 round 4). Import-lane runtime holds
  // refund the slot — they are counted in `runtimeWaitsRef` instead.
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // First-attempt toast is keyed here, not on `attemptsUsed === 0`: refunding
  // a runtime hold would otherwise re-fire the announcement on every retry.
  const announcedRef = useRef<Set<string>>(new Set());
  const runtimeWaitsRef = useRef<Map<string, number>>(new Map());
  const runtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by the age-gate timer below (and by import-lane runtime backoff)
  // so the effect re-evaluates when a too-young candidate becomes eligible or
  // a cold VM is still starting. Without it, a quiet chat's /versions payload
  // stays deep-equal across SWR polls → same array identity → the effect
  // never re-runs (pr-ai-review F-285e977ed706 on #1027).
  const [ageGateNonce, setAgeGateNonce] = useState(0);

  const scheduleRetry = (delayMs = RESUME_VERIFY_RUNTIME_RETRY_MS) => {
    if (runtimeRetryTimerRef.current !== null) {
      clearTimeout(runtimeRetryTimerRef.current);
    }
    runtimeRetryTimerRef.current = setTimeout(() => {
      runtimeRetryTimerRef.current = null;
      setAgeGateNonce((nonce) => nonce + 1);
    }, delayMs);
  };

  // Runtime-retry timer is cleared on unmount only. Do not cancel it from the
  // main effect — that would drop a scheduled probe on a versions-identity
  // change, and must never cancel an in-flight verify chain.
  useEffect(() => {
    return () => {
      if (runtimeRetryTimerRef.current !== null) {
        clearTimeout(runtimeRetryTimerRef.current);
        runtimeRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chatId || isStreaming) return;
    const { candidate, eligibleAtMs } = resolveResumeCandidate(versions, Date.now());
    if (!candidate) {
      if (eligibleAtMs === null) return;
      // Self-schedule the re-check for when the min-age gate opens (+1 s
      // margin). The cleanup only clears THIS timer — it never cancels an
      // in-flight verify chain (the no-cancellation contract above).
      const timer = setTimeout(
        () => setAgeGateNonce((nonce) => nonce + 1),
        Math.max(eligibleAtMs - Date.now(), 0) + 1_000,
      );
      return () => clearTimeout(timer);
    }
    const { versionId, lane } = candidate;
    if (inFlightRef.current.has(versionId)) return;
    if (hasActivePostCheck(chatId)) {
      // Normala post-stream-lanen äger fortfarande verifieringen i den här
      // fliken (den får lagligt vänta in preview ≤150 s sedan #1221). Att
      // starta resume nu ger dubbla Chromium-launcher och en 409-stulen
      // quality gate. Backa utan att förbruka försöksbudgeten och titta igen.
      scheduleRetry();
      return;
    }
    const attemptsUsed = attemptsRef.current.get(versionId) ?? 0;
    if (attemptsUsed >= RESUME_VERIFY_MAX_ATTEMPTS) return;
    attemptsRef.current.set(versionId, attemptsUsed + 1);
    inFlightRef.current.add(versionId);
    const consumeAllAttempts = () =>
      attemptsRef.current.set(versionId, RESUME_VERIFY_MAX_ATTEMPTS);

    if (!announcedRef.current.has(versionId)) {
      announcedRef.current.add(versionId);
      if (lane === "imported") {
        toast.message("Verifierar importerad basversion", {
          description:
            "Den importerade templaten/repot kontrolleras (installation + typecheck) i bakgrunden.",
        });
      } else {
        toast.message("Återupptar verifiering", {
          description:
            "Senaste versionen blev aldrig färdigverifierad — kör verifieringen igen i bakgrunden.",
        });
      }
    }

    // Deliberately NO cancellation (Bugbot HIGH on #353): this effect re-runs
    // on every `versions` identity change (SWR idle-polls /versions every
    // 60 s), so a cleanup-driven `cancelled` flag would abort the lane
    // mid-chain on the first poll tick while the attempt bookkeeping blocks a
    // retry — stranding the row again. Every step below is safe to run to
    // completion past unmount/re-render: the POSTs are idempotent +
    // lease-protected server-side, `toast` is app-global, and SWR's
    // `mutateVersions` is cache-scoped, not component-scoped.
    void (async () => {
      try {
        // Step 1 — image validation (broken external image URLs get
        // auto-replaced + persisted before promote), normal-lane parity
        // (Codex P2 round 2). SKIPPED for the import lane: `autoFix: true`
        // mutates files, and an imported repo is a verbatim contract — the
        // verification pass must never silently rewrite the import.
        let filesRevision: string | null = null;
        let previewUrl = candidate.previewUrl;
        if (lane !== "imported") {
          const image = await runResumeImageValidation({ chatId, versionId });
          if (!image.proceed) {
            // Unconfirmed image mutation — do not attest or promote.
            await persistVersionErrorLogs({
              chatId,
              versionId,
              logs: [
                {
                  level: "warning",
                  category: imageValidationHoldCategory(image.hold ?? null),
                  message: imageValidationHoldMessage(image.hold ?? null),
                },
              ],
            });
            attemptsRef.current.set(versionId, attemptsUsed);
            scheduleRetry();
            return;
          }
          filesRevision = image.filesRevision;
          if (image.persistedMutation) {
            const resynced = await rehydratePreviewUrl({ chatId, versionId });
            if (resynced) previewUrl = resynced;
          }
        }

        // Step 2 — a gate target needs a live preview. The normal lane never
        // verifies a version without one (missing preview = readiness
        // failure), so a stranded row without a persisted previewUrl gets a
        // preview-session boot first — which also persists the URL
        // server-side. Unbootable → hold as retryable (Codex P1 round 4).
        if (!previewUrl) {
          previewUrl = await rehydratePreviewUrl({ chatId, versionId });
          if (!previewUrl) {
            // Cold/unbootable preview is a runtime wait, not a verification
            // attempt — refund like import-lane starting holds so three 8 s
            // 503s cannot exhaust RESUME_VERIFY_MAX_ATTEMPTS.
            attemptsRef.current.set(versionId, attemptsUsed);
            const waits = (runtimeWaitsRef.current.get(versionId) ?? 0) + 1;
            runtimeWaitsRef.current.set(versionId, waits);
            if (waits >= RESUME_VERIFY_MAX_RUNTIME_WAITS) {
              consumeAllAttempts();
              return;
            }
            scheduleRetry();
            return;
          }
        }

        // Step 2b (import lane only) — cold-boot gate (Bugbot medium on
        // #1027): the import route persists the previewUrl while the VM can
        // still be installing, so a postcheck now could misread the boot page
        // as a product failure (sticky productBlocked → F3 block). Probe the
        // live runtime and only proceed on a STABLE verdict:
        //  - "running" / "build_error" → proceed (real answer either way),
        //  - "stopped" / "missing" / "version_mismatch" → bind via
        //    /preview-session, refund the attempt, self-schedule an 8 s retry,
        //  - "starting" → same refund + retry, no rebind (VM is already booting),
        //  - transport failure (null)  → proceed fail-open — the postcheck's
        //    own unreadable-probe advisory covers a dead probe without
        //    blocking, matching the normal lane's best-effort philosophy.
        // Runtime holds do NOT charge {@link RESUME_VERIFY_MAX_ATTEMPTS}.
        if (lane === "imported") {
          const runtime = await fetchPreviewRuntimeStatus({ chatId, versionId });
          const runtimeStatus = runtime.status;
          const isRuntimeHold =
            runtimeStatus === "starting" ||
            runtimeStatus === "version_mismatch" ||
            runtimeStatus === "stopped" ||
            runtimeStatus === "missing";
          if (isRuntimeHold) {
            // Refund the slot reserved above — a cold start is not a
            // verification attempt.
            attemptsRef.current.set(versionId, attemptsUsed);
            const shouldRebind =
              runtimeStatus === "stopped" ||
              runtimeStatus === "missing" ||
              (runtimeStatus === "version_mismatch" &&
                runtime.mismatchDirection !== "session_newer");
            if (shouldRebind) {
              await rehydratePreviewUrl({ chatId, versionId });
            }
            const waits = (runtimeWaitsRef.current.get(versionId) ?? 0) + 1;
            runtimeWaitsRef.current.set(versionId, waits);
            if (waits >= RESUME_VERIFY_MAX_RUNTIME_WAITS) {
              consumeAllAttempts();
              return;
            }
            scheduleRetry();
            return;
          }
        }

        // Step 3 — product-postcheck, mirroring the normal lane order. The
        // route emits `version.degraded` server-side AND the result is
        // persisted as `/error-log` rows (incl. `product_postcheck.summary`,
        // the row the F3 trigger + /finalize-design enforce) so a resumed
        // promotion can never read as solid green without DOM verification
        // (Codex P1 rounds 1+2).
        const postcheck = await runResumeProductPostcheck({
          chatId,
          versionId,
          previewUrl,
          filesRevision,
        });
        if (postcheck.pendingHold) {
          // L6: claim_busy / claim_unavailable. Same-tab Chromium is already
          // running or the claim table is briefly down — refund and wait.
          // Do not treat this as superseded (that loop takeovers a passed
          // row) and do not persist transport_error.
          attemptsRef.current.set(versionId, attemptsUsed);
          const waits = (runtimeWaitsRef.current.get(versionId) ?? 0) + 1;
          runtimeWaitsRef.current.set(versionId, waits);
          if (waits >= RESUME_VERIFY_MAX_RUNTIME_WAITS) {
            consumeAllAttempts();
            return;
          }
          scheduleRetry(postcheck.retryAfterMs ?? RESUME_VERIFY_RUNTIME_RETRY_MS);
          return;
        }
        if (postcheck.superseded) {
          // The inspected lifecycle was replaced while the browser work ran.
          // Refund the slot and retry against the new active tuple; never emit
          // a quality-gate verdict for the stale DOM.
          attemptsRef.current.set(versionId, attemptsUsed);
          scheduleRetry();
          return;
        }
        if (postcheck.blockerPersistFailed) {
          // Fail closed (Codex P1 round 4): the blocker row never reached the
          // /error-log enforcement surface — promoting now could let the
          // version be lifted to F3 without its product block. Hold the
          // resume and self-schedule; a later tick retries the chain.
          scheduleRetry();
          return;
        }
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

        // Step 4 — quality gate (verify + promote).
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
        // Both status surfaces, normal-lane parity: `/versions` (history) via
        // mutateVersions above, `/version-status` (active preview badge) via
        // the nonce bump — the badge's poll may have idled before the resume.
        onVersionStatusRefresh?.();

        if (!res.ok) {
          // 409 (stale lease from the killed tab) and 5xx (verify lane
          // briefly down/unconfigured) are retryable holds — self-schedule
          // so a stable SWR versions identity still retries. 404 is terminal.
          if (res.status === 404) consumeAllAttempts();
          else scheduleRetry();
          return;
        }
        // Gate completed — terminal for this session regardless of verdict.
        consumeAllAttempts();
        if (!data || data.superseded) return;

        if (data.passed) {
          toast.success(
            lane === "imported"
              ? data.designAdvisory
                ? "Importen verifierades (med typecheck-varningar)."
                : "Importen verifierades."
              : data.designAdvisory
                ? "Versionen verifierades och publicerades (med typecheck-varningar)."
                : "Versionen verifierades och publicerades.",
          );
        } else if (data.promoteError || data.promotionBlocked) {
          toast.message("Verifieringen gick inte att slutföra", {
            description:
              "Byggkontrollerna kördes men versionen kunde inte publiceras. Öppna diagnostik-dialogen för detaljer.",
          });
        } else {
          // Deliberate scope-out (Codex P2 round 4, repair-gate rule): the
          // resume lane does NOT open a new server-repair entry point. The
          // row is now truthfully failed; repair stays available through the
          // normal diagnostics/repair UI.
          toast.message("Verifieringen hittade fel", {
            description:
              "Versionen markerades som ej godkänd. Öppna diagnostik-dialogen för detaljer.",
          });
        }
      } catch {
        // Best-effort resume: network failures are a retryable hold — the
        // slot bookkeeping above already charged one attempt. Self-schedule
        // so a reused versions array cannot strand the remaining budget.
        scheduleRetry();
      } finally {
        inFlightRef.current.delete(versionId);
      }
    })();
    // Callback deps are safe: the attempt bookkeeping dedupes per versionId,
    // so an identity change can never start a duplicate in-flight run.
    // `ageGateNonce` re-arms the evaluation when the min-age timer fires.
  }, [chatId, versions, isStreaming, mutateVersions, onVersionStatusRefresh, ageGateNonce]);
}
