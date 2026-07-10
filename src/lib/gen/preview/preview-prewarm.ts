import { FEATURES } from "@/lib/config";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { startPreviewHostSession } from "@/lib/gen/preview/preview-host-client";
import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import type { CodeFile } from "@/lib/gen/parser";

/**
 * Preview prewarm (host wake-up + install overlap).
 *
 * A brand-new chat's first generation has a COLD preview workspace on the Fly
 * VM, so its first preview boot pays the full `npm install` cost after the LLM
 * has already finished. This module fires a fire-and-forget preview-host boot
 * with the baseline scaffold skeleton at the START of generation, so:
 *   1. a sleeping Fly machine wakes up, and
 *   2. `npm install` runs on the VM while the LLM is still streaming.
 *
 * Most generated sites keep the FIXED baseline dependency set
 * (`project-scaffold.ts` PACKAGE_JSON). When the finalize `package.json`
 * (+ any lockfile) is byte-identical to the baseline the prewarm installed,
 * the finalize boot reuses the warm `node_modules` and SKIPS install
 * (dependency-fingerprint match in `preview-host/src/runtime.js` — the
 * fingerprint hashes the package.json/lockfile bytes). This is BEST-EFFORT,
 * not guaranteed: if the dep-completer adds packages or the model emits a
 * different package.json, the fingerprint differs and install still runs at
 * finalize (the prewarm then mainly served to wake the VM). The
 * prewarm session is keyed by the real `chatId`, so the host reuses the same
 * workspace on the finalize `start`; the prewarm does NOT write the app-side
 * session pointer, so it does not itself surface a URL to the iframe (only the
 * finalize `preview-ready` sets it).
 *
 * Everything here is best-effort: any failure is swallowed and simply means
 * the site boots the old way (full install after generation). Gated behind
 * `FEATURES.previewPrewarm` (default OFF). NOTE: the net latency win depends on
 * the fingerprint-match rate and on the host serialising the finalize boot
 * behind an in-flight prewarm boot — MEASURE on the preview host before
 * enabling the flag (see the PR / BUG-SWARM-BACKLOG.md).
 */

/** Minimal placeholder page so the prewarm boot reaches a green "running" state
 * (SCAFFOLD_FILES ships no `app/page.tsx`). Does not affect the dependency
 * fingerprint (that hashes package.json/lockfiles only), and is overwritten by
 * the real generated page on the finalize boot. */
const PREWARM_PLACEHOLDER_PAGE = `export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", color: "#666" }}>
      <p>Förbereder förhandsvisning…</p>
    </main>
  );
}
`;

/** Chats we have already fired a prewarm for, so a retry / duplicate stream for
 * the same chat does not spawn a second boot. Cleared on failure so a genuine
 * later attempt can retry. Bounded with FIFO eviction so a long-lived server
 * process does not accumulate one entry per generation forever (the host's
 * idle-reaper / session-TTL is the real lifecycle owner; this Set is only a
 * short-term duplicate-boot guard). This is intentionally process-local:
 * separate serverless instances can still prewarm the same chat. Within one JS
 * isolate there is no TOCTOU window between `has()` and
 * `rememberPrewarmedChat()` because no `await` occurs between them. */
const prewarmedChatIds = new Set<string>();
const MAX_PREWARM_DEDUP_ENTRIES = 512;

function rememberPrewarmedChat(chatId: string): void {
  prewarmedChatIds.add(chatId);
  while (prewarmedChatIds.size > MAX_PREWARM_DEDUP_ENTRIES) {
    const oldest = prewarmedChatIds.values().next().value;
    if (oldest === undefined) break;
    prewarmedChatIds.delete(oldest);
  }
}

export type PreviewPrewarmResult = {
  started: boolean;
  /** Machine-readable reason when `started` is false. */
  reason?:
    | "flag_off"
    | "no_chat"
    | "tier2_not_configured"
    | "already_prewarmed"
    | "host_error"
    | "prewarm_threw";
  message?: string;
};

/** Reset dedup state between tests. */
export function __resetPreviewPrewarmStateForTests(): void {
  prewarmedChatIds.clear();
}

function skeletonFilesJson(): Record<string, string> {
  const skeleton: CodeFile[] = buildCompleteProject([]);
  const filesJson: Record<string, string> = {};
  for (const file of skeleton) {
    filesJson[file.path] = file.content;
  }
  if (!filesJson["app/page.tsx"]) {
    filesJson["app/page.tsx"] = PREWARM_PLACEHOLDER_PAGE;
  }
  return filesJson;
}

/**
 * Best-effort: start warming the preview host for `chatId`. Safe to call
 * unconditionally at generation start — it self-gates (flag off, tier-2 not
 * configured, already prewarmed) and never throws. Call it fire-and-forget:
 * `void prewarmPreviewSession(chatId);`
 *
 * IMPORTANT: only call this for NEW chats (no existing versions). Follow-ups
 * already have a warm workspace, so prewarming them is wasted work.
 */
export async function prewarmPreviewSession(
  chatId: string,
): Promise<PreviewPrewarmResult> {
  if (!FEATURES.previewPrewarm) return { started: false, reason: "flag_off" };
  if (!chatId) return { started: false, reason: "no_chat" };
  if (!getPreviewHostBaseUrl()) {
    return { started: false, reason: "tier2_not_configured" };
  }
  if (prewarmedChatIds.has(chatId)) {
    return { started: false, reason: "already_prewarmed" };
  }
  rememberPrewarmedChat(chatId);

  try {
    const filesJson = skeletonFilesJson();
    const res = await startPreviewHostSession({
      chatId,
      versionId: `${chatId}-prewarm`,
      filesJson,
    });
    if (!res.ok) {
      // Allow a real (finalize-driven) start to proceed unaffected, and let a
      // later prewarm retry if the stream is restarted.
      prewarmedChatIds.delete(chatId);
      console.warn(`[preview-prewarm] host boot failed for ${chatId}: ${res.message}`);
      return { started: false, reason: "host_error", message: res.message };
    }
    console.info(`[preview-prewarm] warming preview host for ${chatId} (${res.previewSessionId}).`);
    return { started: true };
  } catch (err) {
    prewarmedChatIds.delete(chatId);
    const message = err instanceof Error ? err.message : "prewarm failed";
    console.warn(`[preview-prewarm] threw for ${chatId}: ${message}`);
    return { started: false, reason: "prewarm_threw", message };
  }
}
