import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, dbConfigured } from "@/lib/db/client";
import { engineVersions, generationTelemetry } from "@/lib/db/schema";
import {
  classifyRevisionMatch,
  isContentRevisionGateEnabled,
  shortRevision,
  type RevisionMatch,
} from "@/lib/gen/verify/content-revision";
import { incContentRevisionMismatch } from "@/lib/observability/metrics";
import { assertDbConfigured } from "./shared";

export type CreateTelemetryRecord = {
  chatId: string;
  versionId?: string | null;
  scaffoldId?: string | null;
  scaffoldAlternatives?: string[] | null;
  scaffoldSelectionMethod?: string | null;
  scaffoldSelectionConfidence?: string | null;
  briefInfluencedSelection?: boolean;
  /** Orchestrate-låst scaffold-variant för generationen (t.ex. `corporate-grid`). */
  variantId?: string | null;
  model: string;
  modelTier?: string | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  promptClassification?: string | null;
  retryCount?: number;
  autofixApplied?: boolean;
  syntaxFixerUsed?: boolean;
  preflightErrorCount?: number;
  preflightWarningCount?: number;
  seoIssueCount?: number;
  previewSuccess?: boolean | null;
  previewBlockingReason?: string | null;
  qualityGateResult?: string | null;
  durationMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  fileCount?: number | null;
  scaffoldRetryUsed?: boolean;
  scaffoldRetrySuggested?: string | null;
  meta?: Record<string, unknown> | null;
  /**
   * The exact `files_json` content the verdict assessed, when that is NOT what
   * the version row currently holds. Only the repair lane needs it — see
   * {@link currentFilesRevision}.
   */
  assessedFilesJson?: string | null;
};

export type UpdateTelemetryRecord = Partial<
  Omit<CreateTelemetryRecord, "chatId" | "model"> & {
    deployResult?: string | null;
    userFeedback?: string | null;
  }
>;

/**
 * Innehållsrevisionen som gällde när verdiktet skrevs, hämtad i samma
 * INSERT — inte av anroparen.
 *
 * Anropar-sidig stämpling vore samma glömbarhets-bugg som planen stängde på
 * versionssidan: nästa nya telemetri-anropare skulle tyst skriva `null`, och
 * `null` betyder "okänd revision", vilket är fail-open. En subselect kan
 * ingen anropare glömma.
 *
 * Fönstret mellan att grinden läste filerna och att raden skrivs är skyddat av
 * files_json-leasen (#507), som hindrar samtidiga skrivningar under
 * verifiering — så subselecten ser det innehåll grinden faktiskt bedömde.
 * Saknas versionen (eller raden är versionslös) blir revisionen `null`, alltså
 * dagens beteende.
 *
 * **Undantaget är repair-lanen.** Där ligger kandidaten i `repaired_files_json`
 * medan `files_json` fortfarande håller den bas som föll, så en subselect skulle
 * arkivera ett `preflight_passed` under fel innehåll (Bugbot/Codex/Vercel på
 * #642). Anroparen skickar då `assessedFilesJson` och revisionen räknas med
 * samma `md5()` som den genererade kolumnen — inte app-sidigt — så värdena är
 * jämförbara per konstruktion.
 */
function resolveFilesRevision(record: {
  versionId?: string | null;
  assessedFilesJson?: string | null;
}) {
  if (record.assessedFilesJson != null) {
    return sql<string>`md5(${record.assessedFilesJson})`;
  }
  if (!record.versionId) return null;
  return sql<string | null>`(SELECT files_revision FROM engine_versions WHERE id = ${record.versionId})`;
}

export async function createGenerationTelemetryRecord(record: CreateTelemetryRecord) {
  assertDbConfigured();
  const id = nanoid();
  const rows = await db
    .insert(generationTelemetry)
    .values({
      id,
      chatId: record.chatId,
      versionId: record.versionId ?? null,
      filesRevision: resolveFilesRevision(record),
      scaffoldId: record.scaffoldId ?? null,
      scaffoldAlternatives: record.scaffoldAlternatives ?? null,
      scaffoldSelectionMethod: record.scaffoldSelectionMethod ?? null,
      scaffoldSelectionConfidence: record.scaffoldSelectionConfidence ?? null,
      briefInfluencedSelection: record.briefInfluencedSelection ?? false,
      variantId: record.variantId ?? null,
      model: record.model,
      modelTier: record.modelTier ?? null,
      buildIntent: record.buildIntent ?? null,
      buildMethod: record.buildMethod ?? null,
      promptClassification: record.promptClassification ?? null,
      retryCount: record.retryCount ?? 0,
      autofixApplied: record.autofixApplied ?? false,
      syntaxFixerUsed: record.syntaxFixerUsed ?? false,
      preflightErrorCount: record.preflightErrorCount ?? 0,
      preflightWarningCount: record.preflightWarningCount ?? 0,
      seoIssueCount: record.seoIssueCount ?? 0,
      previewSuccess: record.previewSuccess ?? null,
      previewBlockingReason: record.previewBlockingReason ?? null,
      qualityGateResult: record.qualityGateResult ?? null,
      durationMs: record.durationMs ?? null,
      promptTokens: record.promptTokens ?? null,
      completionTokens: record.completionTokens ?? null,
      fileCount: record.fileCount ?? null,
      scaffoldRetryUsed: record.scaffoldRetryUsed ?? false,
      scaffoldRetrySuggested: record.scaffoldRetrySuggested ?? null,
      meta: record.meta ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateTelemetryRecord(
  id: string,
  updates: UpdateTelemetryRecord,
) {
  assertDbConfigured();
  const rows = await db
    .update(generationTelemetry)
    .set(updates)
    .where(eq(generationTelemetry.id, id))
    .returning();
  return rows[0];
}

/**
 * Fas 0 telemetri-hygien: stamp the deploy outcome onto the latest telemetry
 * row for a version. Mirrors the `feedback/route.ts` pattern
 * (`getTelemetryForVersion` → `updateTelemetryRecord`).
 *
 * Best-effort by contract: a deploy must never fail because telemetry could
 * not be written, so this swallows all errors and no-ops when the version has
 * no telemetry row (e.g. eval/synthetic versions). Takes the newest row for
 * the version — same "latest wins" semantics as the user-feedback writer.
 *
 * `result` is a short outcome tag, e.g. `"production:ready"` / `"preview:queued"`
 * / `"error"` — queried by `scripts/db/control-stats.mjs`.
 */
export async function recordDeployResultForVersion(
  versionId: string,
  result: string,
): Promise<void> {
  try {
    if (!versionId) return;
    const rows = await getTelemetryForVersion(versionId);
    const latest = rows[0];
    if (!latest) return;
    await updateTelemetryRecord(latest.id, { deployResult: result });
  } catch (err) {
    console.warn("[telemetry] Failed to record deploy result:", err);
  }
}

/**
 * M#pv1 (honest `preview_success`): stamp the confirmed preview RUNTIME outcome
 * onto the version's latest telemetry row. Mirrors `recordDeployResultForVersion`.
 *
 * `preview_success` is a tri-state the readers already assume (see
 * `scaffold-scoring.ts` SAJ-49, `scripts/db/scaffold-scores.mjs`,
 * backoffice `_preview_label`):
 *   - `true`  = runtime confirmed responding (preview-host `/status running:true`,
 *               i.e. a real runtime-ready receipt).
 *   - `false` = the preview will not / did not produce a working runtime
 *               (preview blocked, or the session start failed).
 *   - `null`  = pending / unconfirmed (fresh boot queued, or no preview attempt).
 *
 * The finalize writer (`persist-telemetry.ts`) no longer claims `true` from a
 * pre-preview preflight signal; it writes the honest pending/blocked value and
 * this stamp records the confirmed outcome once the preview attempt resolves.
 * Callsites hang off EXISTING receipt points (no new polling): post-finalize
 * (block/start-fail/resume-verified), the routes that observe the host's
 * `running:true` status (`GET /preview-status`, `POST /preview-session`
 * resume), and — the normal-path receipt (PR #377 runda 3) —
 * `POST /preview-heartbeat`, which fires every ~25s while the iframe is live
 * and verifies the receipt with one host `/status` call before stamping.
 *
 * **Monotonic AND atomic by contract** (PR #377 review rounds 1+2 — stale or
 * racing events must never downgrade a confirmed outcome). The monotonicity is
 * enforced INSIDE the single UPDATE statement (no read-check-write window —
 * two racing receipt writers can never let "whoever commits last" win):
 *   - `true`-stamp: `WHERE … AND preview_success IS DISTINCT FROM true` —
 *     `null → true` and `false → true` are allowed (a later confirmed boot
 *     wins over an earlier start failure); already-`true` matches nothing.
 *   - `false`-stamp: `WHERE … AND preview_success IS NULL` — only
 *     `null → false` is allowed; a delayed `false` can never overwrite a
 *     confirmed `true` (or an earlier `false`, which would be a no-op anyway).
 *   - The target row (newest telemetry row for the version) is resolved by a
 *     subquery in the same statement, so there is no pre-read at all.
 *
 * Best-effort by contract: a generation/status poll must never fail because
 * telemetry could not be written, so this swallows all errors and no-ops when
 * the version has no telemetry row (the UPDATE simply matches nothing).
 * "Latest row wins" mirrors the deploy/feedback writers — a repair pass
 * creates a NEW row for the same version, so a later receipt stamps the row
 * for the CURRENT content. (M#pv4: with the revision gate OFF that "latest row"
 * can be a row for content the VM never booted; the gate below closes it.)
 *
 * The per-instance confirmed-`true` cache keeps the hot `GET /preview-status`
 * polling path cheap: once a version's ready-stamp actually matched a row on
 * this instance, repeat polls skip the DB round-trip entirely. Safe because
 * `true` is terminal and the SQL guard makes cross-instance stamps idempotent.
 *
 * **Innehållsrevision steg 3 (flagga `SAJTMASKIN_CONTENT_REVISION_GATE`)** stänger
 * M#pv4 i båda dess delar:
 *
 *   - Stämpeln får en revisionsgrind i SAMMA sats: målraden är den senaste rad
 *     som inte är en känd mismatch (`files_revision IS NULL` = okänd, fail-open,
 *     eller lika med versionens nuvarande revision). Ett repair-varv som skapat
 *     en NY rad för innehåll som aldrig bootats kan därför inte längre få
 *     `preview_success = true` av ett kvitto för den gamla sessionen.
 *   - Cachen nycklas på revision i stället för `versionId`, så en
 *     same-version-rewrite (`targetVersionId`) inte kortsluter stämplingen av
 *     den nya raden på den instans som redan sett ett kvitto.
 *
 * Med flaggan av är både SQL:en och cache-nyckeln identiska med tidigare.
 */
const confirmedPreviewReadyRevisions = new Map<string, Set<string>>();
const CONFIRMED_PREVIEW_READY_CACHE_MAX = 500;
/**
 * Per version: bara de senaste revisionerna behövs. En version kan skrivas om
 * många gånger (user-edit, repair), och bara den nuvarande revisionen kan
 * kortsluta något — så ett obegränsat set vore ren tillväxt.
 */
const CONFIRMED_PREVIEW_READY_REVISIONS_PER_VERSION = 8;
/** Cache-nyckel när ingen revision är känd (flagga av, eller okänd revision). */
const UNKNOWN_REVISION_CACHE_KEY = "unknown";

function rememberConfirmedPreviewReady(versionId: string, revisionKey: string): void {
  const existing = confirmedPreviewReadyRevisions.get(versionId);
  if (existing) {
    existing.add(revisionKey);
    while (existing.size > CONFIRMED_PREVIEW_READY_REVISIONS_PER_VERSION) {
      const oldest = existing.values().next().value;
      if (oldest === undefined) break;
      existing.delete(oldest);
    }
    return;
  }
  if (confirmedPreviewReadyRevisions.size >= CONFIRMED_PREVIEW_READY_CACHE_MAX) {
    const oldest = confirmedPreviewReadyRevisions.keys().next().value;
    if (oldest !== undefined) confirmedPreviewReadyRevisions.delete(oldest);
  }
  confirmedPreviewReadyRevisions.set(versionId, new Set([revisionKey]));
}

function hasConfirmedPreviewReady(versionId: string, revisionKey: string): boolean {
  return confirmedPreviewReadyRevisions.get(versionId)?.has(revisionKey) === true;
}

/** Test-only: clears the per-instance confirmed-ready cache between test cases. */
export function resetConfirmedPreviewReadyCacheForTests(): void {
  confirmedPreviewReadyRevisions.clear();
}

/**
 * Whether a receipt point should still verify + stamp the runtime-ready outcome,
 * i.e. the inverse of "already confirmed on this instance". Lets hot callers
 * (heartbeat-route's one-shot host verification) skip both the host `/status`
 * call and the DB write once confirmed. Per-instance only — cross-instance
 * duplicates are harmless (the SQL guard makes stamps idempotent and the host
 * check is a cheap bounded GET).
 *
 * With the revision gate ON the answer is revision-scoped: a version confirmed
 * for revision N must be re-verified once its content becomes N+1, which is the
 * cache half of M#pv4. The extra `files_revision` read only happens for versions
 * this instance has ALREADY confirmed — a never-confirmed version answers `true`
 * without touching the DB, exactly as before.
 */
export async function shouldVerifyPreviewRuntimeReceipt(
  versionId: string,
  opts?: PreviewRuntimeOutcomeOptions,
): Promise<boolean> {
  if (!versionId) return false;
  if (!confirmedPreviewReadyRevisions.has(versionId)) return true;
  if (!isContentRevisionGateEnabled()) {
    return !hasConfirmedPreviewReady(versionId, UNKNOWN_REVISION_CACHE_KEY);
  }
  const bootedRevision =
    typeof opts?.bootedFilesRevision === "string" && opts.bootedFilesRevision.trim()
      ? opts.bootedFilesRevision.trim()
      : null;
  const currentRevision =
    bootedRevision ?? (await getVersionFilesRevision(versionId).catch(() => null));
  return !hasConfirmedPreviewReady(
    versionId,
    currentRevision ?? UNKNOWN_REVISION_CACHE_KEY,
  );
}

export type PreviewRuntimeOutcomeOptions = {
  /**
   * The revision the preview VM ACTUALLY booted or was patched to — i.e. the
   * `files_revision` of the content that was sent to the host, captured at send
   * time by the caller that owns the session.
   *
   * Pass it whenever it is known. The DB fallback below reads the version's
   * CURRENT revision, and that is a proxy, not the truth: the row can advance
   * to N+1 (repair accept, user edit) while the VM still serves N, and then a
   * receipt for N would be matched against N+1 and either stamp the wrong row
   * or be discarded as a mismatch. The fallback stays only because not every
   * caller has the session in hand yet; it is a degradation, not the contract.
   */
  bootedFilesRevision?: string | null;
};

export async function recordPreviewRuntimeOutcomeForVersion(
  versionId: string,
  previewSuccess: boolean,
  opts?: PreviewRuntimeOutcomeOptions,
): Promise<void> {
  try {
    if (!versionId || !dbConfigured) return;
    const gateEnabled = isContentRevisionGateEnabled();
    const bootedRevision =
      typeof opts?.bootedFilesRevision === "string" && opts.bootedFilesRevision.trim()
        ? opts.bootedFilesRevision.trim()
        : null;
    // The revision the VM is serving for this session. Prefer what the caller
    // observed at boot/patch time; only fall back to the version's current
    // content when nobody told us (see PreviewRuntimeOutcomeOptions).
    const currentRevision = !gateEnabled
      ? null
      : (bootedRevision ?? (await getVersionFilesRevision(versionId).catch(() => null)));
    const revisionKey = currentRevision ?? UNKNOWN_REVISION_CACHE_KEY;
    // Confirmed ready for this content on this instance: any further stamp is a
    // guaranteed no-op (`true` is terminal), so skip the DB round-trip entirely.
    if (hasConfirmedPreviewReady(versionId, revisionKey)) return;

    // Revision guard lives INSIDE the statement (same reason the monotonicity
    // does — no read-check-write window): the subselect is re-evaluated at
    // execution time, so a content rewrite that commits between our pre-read and
    // this UPDATE cannot make a mismatched row the target.
    //
    // When the caller told us what the VM actually booted we match against THAT
    // revision (bound as a parameter), not the version's current row: the row
    // may have advanced to N+1 while the VM still serves N, and a receipt for N
    // must land on the N row. The subselect stays for the fallback where nobody
    // told us — then "current content" is the only proxy we have.
    const contentRevisionExpr =
      bootedRevision !== null
        ? sql`${bootedRevision}`
        : sql`(
        SELECT ${engineVersions.filesRevision} FROM ${engineVersions}
        WHERE ${engineVersions.id} = ${versionId}
      )`;
    const revisionMatchesContent = sql`(
      ${generationTelemetry.filesRevision} IS NULL
      OR ${generationTelemetry.filesRevision} = ${contentRevisionExpr}
    )`;
    const targetRowIdForVersion = gateEnabled
      ? sql`(
      SELECT ${generationTelemetry.id} FROM ${generationTelemetry}
      WHERE ${generationTelemetry.versionId} = ${versionId}
        AND ${revisionMatchesContent}
      ORDER BY ${generationTelemetry.createdAt} DESC
      LIMIT 1
    )`
      : sql`(
      SELECT ${generationTelemetry.id} FROM ${generationTelemetry}
      WHERE ${generationTelemetry.versionId} = ${versionId}
      ORDER BY ${generationTelemetry.createdAt} DESC
      LIMIT 1
    )`;
    const monotonicGuard = previewSuccess
      ? sql`${generationTelemetry.previewSuccess} IS DISTINCT FROM true`
      : isNull(generationTelemetry.previewSuccess);
    const result = await db
      .update(generationTelemetry)
      .set({ previewSuccess })
      .where(
        and(sql`${generationTelemetry.id} = ${targetRowIdForVersion}`, monotonicGuard),
      );
    if ((result.rowCount ?? 0) > 0) {
      if (previewSuccess) rememberConfirmedPreviewReady(versionId, revisionKey);
      return;
    }
    if (!previewSuccess && !gateEnabled) return;
    // rowCount 0 is ambiguous. For a true-stamp: either no telemetry row exists
    // yet (do NOT cache — a later stamp must still land once the row appears),
    // or the row is already true (stamped by another instance). With the gate on
    // there is a third case worth counting: every candidate row is a KNOWN
    // mismatch, i.e. no gate row describes what the VM serves. One read
    // disambiguates; for a true-stamp it runs at most once per version per
    // instance (after it, the cache short-circuits).
    const rows = await getTelemetryForVersion(versionId);
    const target = gateEnabled
      ? rows.find(
          (row) => classifyRevisionMatch(row.filesRevision, currentRevision) !== "stale",
        )
      : rows[0];
    if (previewSuccess && target?.previewSuccess === true) {
      rememberConfirmedPreviewReady(versionId, revisionKey);
      return;
    }
    if (gateEnabled && !target && rows.length > 0) {
      incContentRevisionMismatch("preview_receipt", {
        verdict: rows[0]?.qualityGateResult ?? null,
      });
      console.warn(
        `[content-revision] Skipped preview receipt for version ${versionId}: ` +
          `every telemetry row describes another revision (senaste ${shortRevision(
            rows[0]?.filesRevision,
          )}, innehåll ${shortRevision(currentRevision)}).`,
      );
    }
  } catch (err) {
    console.warn("[telemetry] Failed to record preview runtime outcome:", err);
  }
}

export async function getTelemetryForVersion(versionId: string) {
  assertDbConfigured();
  return db
    .select()
    .from(generationTelemetry)
    .where(eq(generationTelemetry.versionId, versionId))
    .orderBy(desc(generationTelemetry.createdAt));
}

/**
 * Innehållsrevisionen versionsraden bär NU (DB-genererad `md5(files_json)`).
 * `null` när versionen saknas eller kolumnen aldrig fylldes — vilket läsarna
 * ska tolka som "okänd", inte som mismatch.
 */
async function getVersionFilesRevision(versionId: string): Promise<string | null> {
  assertDbConfigured();
  const rows = await db
    .select({ filesRevision: engineVersions.filesRevision })
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return rows[0]?.filesRevision ?? null;
}

/**
 * Verdiktsignalen för en version, med den innehållsrevision verdiktet gäller.
 *
 * - `revisionMatch: "current"` — raden bär innehållets nuvarande revision, så
 *   `result` är ett svar om DET innehållet.
 * - `revisionMatch: "unknown"` — ingen revision att jämföra (rad före steg 2,
 *   versionslös rad, gate av). `result` är dagens "senaste rad"-svar och
 *   behandlas fail-open precis som förut (planens beslut 1b).
 * - `revisionMatch: "stale"` — **känd mismatch**: raden bär en revision och den
 *   är inte innehållets. `result` följer med för loggning, men är per definition
 *   inget svar om det aktuella innehållet — läsaren ska behandla versionen som
 *   overifierad (symmetriskt: gäller både `passed` och `failed`, beslut 1a).
 */
export type QualityGateSignal = {
  result: string | null;
  revisionMatch: RevisionMatch;
  /** Revisionen raden bär (`null` = okänd). */
  verdictRevision: string | null;
  /** Revisionen innehållet som bedöms har (`null` = okänd). */
  contentRevision: string | null;
};

export type QualityGateSignalOptions = {
  /**
   * Det exakta `files_json` som är på väg att promotas när det INTE är vad
   * versionsraden håller — repair-accept läser den pendlande reparationen ur
   * `repaired_files_json` och skriver den till `files_json` i samma
   * transaktion, så versionens nuvarande revision är fortfarande basens.
   * Samma explicita mönster som `assessedFilesJson` (#646): jämför mot det
   * innehåll verdiktet faktiskt gäller i stället för att stämpla om något.
   */
  promotedFilesJson?: string | null;
};

/**
 * Latest quality-gate signal for a version — senaste telemetri-raden vinner, så
 * ett korrigerande repair-varv ersätter ett tidigare failande varv.
 *
 * **Med flaggan av** (`SAJTMASKIN_CONTENT_REVISION_GATE`) är detta exakt dagens
 * beteende: senaste radens `quality_gate_result`, alltid `revisionMatch:
 * "unknown"`, ingen extra DB-läsning.
 *
 * **Med flaggan på** avgör den NYASTE raden först: saknar den revision är läget
 * okänt och den raden returneras (okänt får aldrig blockera, och ett äldre
 * verdikt får aldrig gå före ett nyare på ett antagande); bär den innehållets
 * revision är den svaret. Är den en känd mismatch letas en äldre rad som
 * faktiskt beskriver innehållet — finns ingen är det en känd mismatch: "ingen
 * gate har körts för det här innehållet".
 */
type TelemetryRevisionRow = {
  qualityGateResult?: string | null;
  filesRevision?: string | null;
};

/**
 * Shared revision match for one version's telemetry rows (newest first) against
 * a known content revision. Same rules as the gate-on path in
 * {@link getLatestQualityGateSignalForVersion}.
 */
function resolveQualityGateSignalFromRows(
  rowsNewestFirst: TelemetryRevisionRow[],
  contentRevision: string | null,
): QualityGateSignal {
  const latest = rowsNewestFirst[0];
  const legacySignal: QualityGateSignal = {
    result: latest?.qualityGateResult ?? null,
    revisionMatch: "unknown",
    verdictRevision: latest?.filesRevision ?? null,
    contentRevision: null,
  };
  if (!latest || !contentRevision) return legacySignal;

  const latestMatch = classifyRevisionMatch(latest.filesRevision, contentRevision);
  if (latestMatch === "unknown") {
    return { ...legacySignal, contentRevision };
  }
  if (latestMatch === "current") {
    return {
      result: latest.qualityGateResult ?? null,
      revisionMatch: "current",
      verdictRevision: latest.filesRevision ?? null,
      contentRevision,
    };
  }
  const matching = rowsNewestFirst.find(
    (row) => classifyRevisionMatch(row.filesRevision, contentRevision) === "current",
  );
  if (matching) {
    return {
      result: matching.qualityGateResult ?? null,
      revisionMatch: "current",
      verdictRevision: matching.filesRevision ?? null,
      contentRevision,
    };
  }
  return {
    result: latest.qualityGateResult ?? null,
    revisionMatch: "stale",
    verdictRevision: latest.filesRevision ?? null,
    contentRevision,
  };
}

export async function getLatestQualityGateSignalForVersion(
  versionId: string,
  opts?: QualityGateSignalOptions,
): Promise<QualityGateSignal> {
  const rows = await getTelemetryForVersion(versionId);
  const latest = rows[0];
  const legacySignal: QualityGateSignal = {
    result: latest?.qualityGateResult ?? null,
    revisionMatch: "unknown",
    verdictRevision: latest?.filesRevision ?? null,
    contentRevision: null,
  };
  if (!isContentRevisionGateEnabled() || !latest) return legacySignal;

  const promotedFilesJson = opts?.promotedFilesJson;
  const contentRevision =
    promotedFilesJson != null
      ? createHash("md5").update(promotedFilesJson, "utf8").digest("hex")
      : await getVersionFilesRevision(versionId);
  if (!contentRevision) return legacySignal;

  // Ordningen är regeln, inte en optimering. Den NYASTE raden avgör först:
  //
  //  - saknar den revision är läget `unknown`, och okänt behåller dagens
  //    "senaste rad vinner"-svar (beslut 1b). Att i det läget leta upp en
  //    ÄLDRE rad som råkar matcha innehållet vore att låta ett äldre verdikt
  //    gå före ett nyare på ett antagande revisionen inte stöder — precis den
  //    sortens tysta omtolkning gaten finns för att undvika.
  //  - bär den innehållets revision är den svaret.
  //
  // Först när den nyaste raden är en KÄND mismatch är det meningsfullt att
  // fråga om någon äldre rad faktiskt beskriver innehållet.
  return resolveQualityGateSignalFromRows(rows, contentRevision);
}

/**
 * Batch variant of {@link getLatestQualityGateSignalForVersion} for a whole chat.
 *
 * Used by the polled `GET .../versions` list — **one** DB round-trip, never
 * N+1 per version. Flag off → empty map and **zero** DB reads (exact today's
 * list behaviour). Read-only; never writes.
 *
 * SQL shape: `DISTINCT ON (version_id) … ORDER BY version_id, created_at DESC`
 * for the latest telemetry row per version, joined to
 * `engine_versions.files_revision`, plus a lateral lookup for an older row that
 * matches current content when the latest is a known mismatch — same revision
 * semantics as the single-version reader. Index:
 * `idx_generation_telemetry_version_revision`.
 */
export async function getLatestQualityGateSignalsForChat(
  chatId: string,
): Promise<Map<string, QualityGateSignal>> {
  const out = new Map<string, QualityGateSignal>();
  if (!chatId || !isContentRevisionGateEnabled()) return out;
  assertDbConfigured();

  const result = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (t.version_id)
        t.version_id AS version_id,
        t.quality_gate_result AS quality_gate_result,
        t.files_revision AS verdict_revision,
        v.files_revision AS content_revision
      FROM generation_telemetry t
      INNER JOIN engine_versions v ON v.id = t.version_id
      WHERE t.chat_id = ${chatId}
        AND t.version_id IS NOT NULL
      ORDER BY t.version_id, t.created_at DESC
    )
    SELECT
      l.version_id AS "versionId",
      l.quality_gate_result AS "latestResult",
      l.verdict_revision AS "latestVerdictRevision",
      l.content_revision AS "contentRevision",
      m.quality_gate_result AS "matchingResult",
      m.files_revision AS "matchingVerdictRevision"
    FROM latest l
    LEFT JOIN LATERAL (
      SELECT t2.quality_gate_result, t2.files_revision
      FROM generation_telemetry t2
      WHERE t2.version_id = l.version_id
        AND l.content_revision IS NOT NULL
        AND t2.files_revision IS NOT NULL
        AND t2.files_revision = l.content_revision
      ORDER BY t2.created_at DESC
      LIMIT 1
    ) m ON true
  `);

  const rows =
    (result as unknown as {
      rows?: Array<{
        versionId: string | null;
        latestResult: string | null;
        latestVerdictRevision: string | null;
        contentRevision: string | null;
        matchingResult: string | null;
        matchingVerdictRevision: string | null;
      }>;
    }).rows ??
    (Array.isArray(result)
      ? (result as Array<{
          versionId: string | null;
          latestResult: string | null;
          latestVerdictRevision: string | null;
          contentRevision: string | null;
          matchingResult: string | null;
          matchingVerdictRevision: string | null;
        }>)
      : []);

  for (const row of rows) {
    if (!row.versionId) continue;
    const contentRevision = row.contentRevision ?? null;
    const latestRow: TelemetryRevisionRow = {
      qualityGateResult: row.latestResult,
      filesRevision: row.latestVerdictRevision,
    };
    const rowsNewestFirst: TelemetryRevisionRow[] = [latestRow];
    if (
      row.matchingVerdictRevision != null &&
      row.matchingVerdictRevision !== row.latestVerdictRevision
    ) {
      rowsNewestFirst.push({
        qualityGateResult: row.matchingResult,
        filesRevision: row.matchingVerdictRevision,
      });
    }
    out.set(row.versionId, resolveQualityGateSignalFromRows(rowsNewestFirst, contentRevision));
  }
  return out;
}

/**
 * Stamp a fresh `preflight_passed` quality-gate signal after a server repair
 * passed its own quality gate.
 *
 * `saveRepairedFiles` is the only writer of `engineVersions.repaired_files_json`
 * and only runs once `shouldPromoteAfterRepair` approved the repaired files, so
 * the repaired content is verified-clean even though the *original* finalize
 * telemetry row may still read `verifier_failed`/`preflight_failed`. Recording
 * the pass keeps `getLatestQualityGateResultForVersion` (and therefore the
 * promotion guard `assertPromoteAllowed`) aligned with the *current* files —
 * otherwise a legitimately-repaired row would be wedged on a stale finalize
 * signal it has already superseded.
 *
 * Best-effort: inherits `chatId`/`model` from the version's latest telemetry
 * row so model/cost analytics stay coherent. If no prior telemetry exists the
 * guard already fails open, so we simply skip. Never throws.
 *
 * `assessedFilesJson` is the promotable repaired content (what `acceptRepair`
 * will write into `files_json`). Without it the row would be stamped with the
 * pre-repair base revision — the verdict would name the content that failed.
 *
 * A version can receive a **replacement** repair before acceptance, so an
 * existing `preflight_passed` is only a duplicate when it describes the same
 * content. Skipping on the result alone would leave repair B promoted while the
 * newest pass still names repair A (Codex P1 on #646) — the same false mismatch
 * this function exists to avoid. The comparison hash is app-side; if it ever
 * disagreed with Postgres' `md5()` the effect is an extra pass row, never a
 * missing one.
 */
export async function recordRepairPassedQualityGate(
  versionId: string,
  assessedFilesJson?: string | null,
): Promise<void> {
  try {
    const rows = await getTelemetryForVersion(versionId);
    const prior = rows[0];
    if (!prior) return;
    if (prior.qualityGateResult === "preflight_passed") {
      const assessedRevision =
        assessedFilesJson != null
          ? createHash("md5").update(assessedFilesJson, "utf8").digest("hex")
          : null;
      if (assessedRevision === null || prior.filesRevision === assessedRevision) return;
    }
    await createGenerationTelemetryRecord({
      chatId: prior.chatId,
      versionId,
      model: prior.model,
      // Ärv varianten från raden som repareras så repair-raden förblir
      // attribuerbar i variant-analyser (samma princip som chatId/model).
      variantId: prior.variantId ?? null,
      qualityGateResult: "preflight_passed",
      assessedFilesJson: assessedFilesJson ?? null,
      meta: { source: "server-repair-pass" },
    });
  } catch (err) {
    console.warn("[telemetry] Failed to stamp repair-passed quality gate:", err);
  }
}
