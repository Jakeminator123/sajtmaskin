import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { previewHostAuthHeaders } from "@/lib/gen/preview/preview-host-client";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";

/**
 * `[PREVIEW-LOGG]` — the preview-host (Fly VM) event log for the chat's ACTIVE
 * preview session, surfaced into OpenClaw's debug context (OC_DEBUG).
 *
 * The preview-host keeps a per-session event log (created/updated/patched/
 * hibernated/destroyed/rollback lines — see `appendLog` in
 * `preview-host/src/server.js`) behind `GET /preview/logs/:previewSessionId`.
 * Until now that log was only reachable via the local `fly` CLI or the
 * observability scripts; this module gives the assistant the same read so it
 * can explain preview/runtime trouble from REAL lines instead of guessing.
 *
 * Fail-soft by design: no active session, unconfigured preview-host, HTTP
 * failure or an empty log all yield `null`, and the chat prompt simply omits
 * the block. Never throws.
 */

/** Max log lines included in the block (most recent kept). */
export const OPENCLAW_PREVIEW_LOG_MAX_LINES = 40;
/** Hard cap on the assembled block, so a pathological log can't blow up the prompt. */
export const OPENCLAW_PREVIEW_LOG_MAX_CHARS = 4_000;

const LOGS_FETCH_TIMEOUT_MS = 4_000;

interface PreviewHostLogLine {
  ts: string;
  message: string;
}

function parseLogLines(payload: unknown): PreviewHostLogLine[] {
  if (!payload || typeof payload !== "object") return [];
  const lines = (payload as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const ts = (line as { ts?: unknown }).ts;
      const message = (line as { message?: unknown }).message;
      if (typeof message !== "string" || !message.trim()) return null;
      return {
        ts: typeof ts === "string" ? ts : "",
        message: message.trim(),
      };
    })
    .filter((line): line is PreviewHostLogLine => line !== null);
}

/**
 * Build the `[PREVIEW-LOGG]` system-message block for an OWNERSHIP-VERIFIED
 * chat id, or `null` when there is nothing (or no way) to show. The caller is
 * responsible for the tenant check — this module never sees the request.
 *
 * `reviewedVersionId` is the version the surrounding review context is keyed
 * to ([BUGGFYND]/[TIDSLINJE]). The preview session is chat-scoped and can be
 * pinned to a DIFFERENT version (the user can switch active version without
 * restarting the preview), so on mismatch the block carries an explicit
 * warning line instead of letting the assistant silently reason about the
 * wrong version's VM log (Bugbot 2026-07-31).
 */
export async function buildOpenClawPreviewLogBlock(
  chatId: string,
  opts?: { reviewedVersionId?: string | null },
): Promise<string | null> {
  const base = getPreviewHostBaseUrl();
  if (!base || !chatId.trim()) return null;

  const session = await getActivePreviewSessionAsync(chatId).catch(() => null);
  if (!session?.previewSessionId) return null;

  let lines: PreviewHostLogLine[];
  try {
    const res = await fetch(
      `${base}/preview/logs/${encodeURIComponent(session.previewSessionId)}`,
      {
        method: "GET",
        headers: { ...previewHostAuthHeaders() },
        cache: "no-store",
        signal: AbortSignal.timeout(LOGS_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    lines = parseLogLines(await res.json());
  } catch {
    return null;
  }
  if (lines.length === 0) return null;

  const kept = lines.slice(-OPENCLAW_PREVIEW_LOG_MAX_LINES);
  const truncatedNote =
    lines.length > kept.length
      ? ` (visar de ${kept.length} senaste av ${lines.length} rader)`
      : "";

  const reviewedVersionId = opts?.reviewedVersionId?.trim() || null;
  const sessionVersionId = session.versionId?.trim() || null;
  const versionMismatch = Boolean(
    reviewedVersionId && sessionVersionId && reviewedVersionId !== sessionVersionId,
  );

  const headerParts: string[] = [
    `[PREVIEW-LOGG] Händelselogg från förhandsvisningens VM (preview-host) för chattens aktiva preview-session${truncatedNote}. Riktiga persisterade rader — hitta aldrig på loggrader; saknas information, säg det.`,
    `session: ${session.previewSessionId} | version: ${sessionVersionId ?? "?"}`,
  ];
  if (versionMismatch) {
    headerParts.push(
      `OBS: preview-sessionen är pinnad till version ${sessionVersionId}, INTE den granskade versionen ${reviewedVersionId} — dra inga slutsatser om den granskade versionen från dessa rader utan att säga det uttryckligen.`,
    );
  }
  const lineParts = kept.map(
    (line) => `- ${line.ts ? `${line.ts} ` : ""}${line.message}`,
  );

  const block = [...headerParts, ...lineParts, "[/PREVIEW-LOGG]"].join("\n");
  if (block.length <= OPENCLAW_PREVIEW_LOG_MAX_CHARS) return block;
  // Keep the tail (newest lines) when over budget; the full header (including
  // any version-mismatch warning) stays intact.
  const head = `${headerParts.join("\n")}\n`;
  const tailBudget = OPENCLAW_PREVIEW_LOG_MAX_CHARS - head.length - "[/PREVIEW-LOGG]".length - 1;
  if (tailBudget <= 0) return null;
  const body = lineParts.join("\n");
  return `${head}${body.slice(-tailBudget)}\n[/PREVIEW-LOGG]`;
}
