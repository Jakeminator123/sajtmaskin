/**
 * K-019: persist a small, sanitized orchestration record on the chat after each
 * successful version save so follow-up prompts can recover tier/contract/strategy
 * signals without duplicating the full optimized prompt.
 */

const SENSITIVE_KEY_SUBSTR = /pass|secret|token|auth|cookie|credential|apikey|api_key/i;
const MAX_STRING = 12_000;
const MAX_DEPTH = 8;
const MAX_KEYS = 80;

function truncateString(s: string): string {
  if (s.length <= MAX_STRING) return s;
  return `${s.slice(0, MAX_STRING)}…`;
}

export function sanitizeOrchestrationSnapshotForStorage(
  input: Record<string, unknown>,
  depth = 0,
  keyCount = { n: 0 },
): Record<string, unknown> {
  if (depth > MAX_DEPTH || keyCount.n > MAX_KEYS) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (keyCount.n > MAX_KEYS) break;
    if (SENSITIVE_KEY_SUBSTR.test(k)) continue;
    keyCount.n += 1;
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[k] = truncateString(v);
      continue;
    }
    if (Array.isArray(v)) {
      const maxLen = 40;
      const slice = v.slice(0, maxLen).map((item) => {
        if (item === null || typeof item === "boolean" || typeof item === "number") return item;
        if (typeof item === "string") return truncateString(item);
        if (typeof item === "object" && item !== null && depth < MAX_DEPTH - 1) {
          return sanitizeOrchestrationSnapshotForStorage(
            item as Record<string, unknown>,
            depth + 1,
            keyCount,
          );
        }
        return "[omitted]";
      });
      out[k] = slice;
      continue;
    }
    if (typeof v === "object" && v !== null) {
      out[k] = sanitizeOrchestrationSnapshotForStorage(
        v as Record<string, unknown>,
        depth + 1,
        keyCount,
      );
    }
  }
  return out;
}

export function buildPersistedOrchestrationSnapshot(params: {
  streamMeta: Record<string, unknown>;
  versionId: string;
  chatId: string;
  buildIntent?: string | null;
}): Record<string, unknown> {
  const base = sanitizeOrchestrationSnapshotForStorage({
    ...params.streamMeta,
    lastVersionId: params.versionId,
    lastChatId: params.chatId,
    buildIntent: params.buildIntent ?? null,
    capturedAt: new Date().toISOString(),
  });
  return base;
}

/** Shallow merge: new finalize wins on key collision; keeps prior keys omitted from latest stream (K-019). */
export function mergePersistedOrchestrationSnapshots(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous } : {};
  return { ...base, ...next };
}

export function prependOrchestrationContinuityToFollowUp(
  message: string,
  snapshot: Record<string, unknown> | null | undefined,
): string {
  if (!snapshot || typeof snapshot !== "object") return message;
  const tier = typeof snapshot.modelTier === "string" ? snapshot.modelTier : null;
  const strat = typeof snapshot.promptStrategy === "string" ? snapshot.promptStrategy : null;
  const scid = typeof snapshot.scaffoldId === "string" ? snapshot.scaffoldId : null;
  const lastV = typeof snapshot.lastVersionId === "string" ? snapshot.lastVersionId : null;
  const buildIntent = typeof snapshot.buildIntent === "string" ? snapshot.buildIntent : null;
  const lines: string[] = [];
  if (tier) lines.push(`- Previous model tier: ${tier}`);
  if (strat) lines.push(`- Previous prompt strategy: ${strat}`);
  if (scid) lines.push(`- Previous scaffold id: ${scid}`);
  if (buildIntent) lines.push(`- Previous build intent: ${buildIntent}`);
  if (lastV) lines.push(`- Last saved version id: ${lastV}`);
  if (lines.length === 0) return message;
  return [
    "## Continuity (from previous generation)",
    "",
    ...lines,
    "",
    "Apply the user's new request below. Do not discard previous work unless the user asks to.",
    "",
    "---",
    "",
    message,
  ].join("\n");
}
