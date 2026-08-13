import { FEATURES } from "@/lib/config";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { startPreviewHostSession } from "@/lib/gen/preview/preview-host-client";
import { buildCompleteProject, mergePackageJsonWithBaseline } from "@/lib/gen/export/project-scaffold";
import { runDepCompleter } from "@/lib/gen/autofix/dep-completer";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import type { CodeFile } from "@/lib/gen/parser";
import { getClientId } from "@/lib/rate-limit";
import { createHmac } from "node:crypto";

/**
 * Preview prewarm (host wake-up + install overlap).
 *
 * A brand-new chat's first generation has a COLD preview workspace on the Fly
 * VM, so its first preview boot pays the full `npm install` cost after the LLM
 * has already finished. This module fires a fire-and-forget preview-host boot
 * with a scaffold-aware skeleton at the START of generation, so:
 *   1. a sleeping Fly machine wakes up, and
 *   2. `npm install` runs on the VM while the LLM is still streaming.
 *
 * Both call sites (`create-chat-stream-post.ts`, `codegen-turn.ts`) fire AFTER
 * orchestration has resolved, so the selected `ScaffoldId` is already known.
 * The skeleton's `package.json` is built the SAME way the finalize path builds
 * its own (`mergePackageJsonWithBaseline` in `project-scaffold.ts`): baseline
 * deps + whatever `runDepCompleter` detects by scanning code for third-party
 * imports. The only difference is the code scanned — finalize scans the
 * model's ACTUAL generated files; prewarm scans the SELECTED SCAFFOLD's own
 * prompt-shaping files (`gen/scaffolds/<id>/files/`), the best proxy available
 * before the LLM has produced anything (the model is heavily prompted with
 * that exact content, so it frequently imports the same third-party packages).
 * When the model additionally emits no `package.json` of its own, this makes
 * the finalize `package.json` byte-identical to the one the prewarm installed,
 * so the finalize boot reuses the warm `node_modules` and SKIPS install
 * (dependency-fingerprint match in `preview-host/src/runtime.js` — the
 * fingerprint hashes the package.json/lockfile bytes; scaffolds ship no
 * lockfile). This is BEST-EFFORT, not guaranteed: if the dep-completer adds
 * packages the scaffold sample never imports, or the model emits a different
 * package.json, the fingerprint still differs and a real install runs at
 * finalize — but npm reuses most of the already-warm `node_modules`, so it is
 * still faster than a fully cold install (the prewarm then mainly served to
 * wake the VM). Without a resolved scaffold id (e.g. imported-repo follow-ups
 * that never reach this call), the skeleton falls back to the fixed baseline
 * dependency set exactly like before. The prewarm session is keyed by the real
 * `chatId`, so the host reuses the same workspace on the finalize `start`; the
 * prewarm does NOT write the app-side session pointer, so it does not itself
 * surface a URL to the iframe (only the finalize `preview-ready` sets it).
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
const PREWARM_RATE_LIMIT_RETRY_COOLDOWN_MS = 5_000;
const prewarmRateLimitUntilByChat = new Map<string, number>();

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
    | "no_lease_key"
    | "tier2_not_configured"
    | "already_prewarmed"
    | "prewarm_superseded"
    | "prewarm_rate_limited"
    | "host_error"
    | "prewarm_threw";
  message?: string;
};

/**
 * Opaque, stable resource-lease key for host-side prewarm throttling.
 *
 * A prewarm happens before normal credit settlement, so it reuses rate-limit
 * identity and sends only an API-keyed HMAC—never raw user/IP/session data.
 * Missing host API key returns null and skips this optional optimization.
 */
export function createPreviewPrewarmLeaseKey(
  request: Request,
  params?: { userId?: string | null },
): string | null {
  const secret = process.env.SAJTMASKIN_PREVIEW_HOST_API_KEY?.trim();
  if (!secret) return null;
  // Reuse the rate-limit owner's canonical subject: verified users are keyed
  // by user id, guests by trusted IP (never their rotatable session cookie).
  const subject = getClientId(request, {
    userId: params?.userId?.trim() || undefined,
  });
  const domainSeparatedSubject = `sajtmaskin:preview-prewarm-lease:v1\0${subject}`;
  return createHmac("sha256", secret).update(domainSeparatedSubject).digest("hex");
}

/** Reset dedup state between tests. */
export function __resetPreviewPrewarmStateForTests(): void {
  prewarmedChatIds.clear();
  prewarmRateLimitUntilByChat.clear();
}

/**
 * Best-effort dependency-fingerprint alignment: scan the SELECTED scaffold's
 * own prompt-shaping files for third-party imports (`runDepCompleter`, the
 * same scanner the finalize path runs over the model's actual output) and
 * merge them onto the baseline `package.json` exactly like
 * `buildCompleteProject` does when the model emits no `package.json` of its
 * own (`mergePackageJsonWithBaseline({}, detected)`). Returns `null` for an
 * unknown/missing scaffold id so the caller keeps the fixed baseline
 * `package.json` unchanged. Never throws — callers already run inside the
 * best-effort `try` in {@link prewarmPreviewSession}.
 */
function scaffoldAwarePackageJson(scaffoldId?: string | null): string | null {
  const id = scaffoldId?.trim();
  if (!id) return null;
  const scaffold = getScaffoldById(id);
  if (!scaffold || scaffold.files.length === 0) return null;
  const allCode = scaffold.files.map((file) => file.content).join("\n");
  const detected = runDepCompleter(allCode);
  const merged = mergePackageJsonWithBaseline({}, detected);
  return JSON.stringify(merged, null, 2);
}

function skeletonFilesJson(scaffoldId?: string | null): Record<string, string> {
  const skeleton: CodeFile[] = buildCompleteProject([]);
  const filesJson: Record<string, string> = {};
  for (const file of skeleton) {
    filesJson[file.path] = file.content;
  }
  if (!filesJson["app/page.tsx"]) {
    filesJson["app/page.tsx"] = PREWARM_PLACEHOLDER_PAGE;
  }
  const scaffoldPackageJson = scaffoldAwarePackageJson(scaffoldId);
  if (scaffoldPackageJson) {
    filesJson["package.json"] = scaffoldPackageJson;
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
 *
 * `options.scaffoldId` is the `ScaffoldId` orchestration already resolved for
 * this generation (`orchestrationBase.resolvedScaffold?.id`) — both call
 * sites fire after orchestration, so it is available. Optional/unknown ids
 * fall back to the fixed baseline dependency set (see module doc comment).
 */
export async function prewarmPreviewSession(
  chatId: string,
  options?: { leaseKey?: string | null; scaffoldId?: string | null },
): Promise<PreviewPrewarmResult> {
  if (!FEATURES.previewPrewarm) return { started: false, reason: "flag_off" };
  if (!chatId) return { started: false, reason: "no_chat" };
  const rateLimitUntil = prewarmRateLimitUntilByChat.get(chatId) ?? 0;
  if (rateLimitUntil > Date.now()) {
    return { started: false, reason: "prewarm_rate_limited" };
  }
  prewarmRateLimitUntilByChat.delete(chatId);
  const leaseKey = options?.leaseKey?.trim() || null;
  if (!leaseKey) return { started: false, reason: "no_lease_key" };
  if (!getPreviewHostBaseUrl()) {
    return { started: false, reason: "tier2_not_configured" };
  }
  if (prewarmedChatIds.has(chatId)) {
    return { started: false, reason: "already_prewarmed" };
  }
  rememberPrewarmedChat(chatId);

  try {
    const filesJson = skeletonFilesJson(options?.scaffoldId);
    const res = await startPreviewHostSession({
      chatId,
      versionId: `${chatId}-prewarm`,
      filesJson,
      prewarm: true,
      prewarmLeaseKey: leaseKey,
    });
    if (!res.ok) {
      if (res.prewarmDisposition === "superseded") {
        console.info(`[preview-prewarm] skipped ${chatId}: real preview already owns the session.`);
        return { started: false, reason: "prewarm_superseded", message: res.message };
      }
      if (res.prewarmDisposition === "rate_limited") {
        // No session was created for this chat. Do not pin it forever in the
        // process-local dedup set; a later explicit user retry may succeed once
        // the canonical subject lease is released/expired. This invocation
        // still performs exactly one host call (no automatic retry).
        prewarmedChatIds.delete(chatId);
        prewarmRateLimitUntilByChat.set(
          chatId,
          Date.now() + PREWARM_RATE_LIMIT_RETRY_COOLDOWN_MS,
        );
        while (prewarmRateLimitUntilByChat.size > MAX_PREWARM_DEDUP_ENTRIES) {
          const oldest = prewarmRateLimitUntilByChat.keys().next().value;
          if (oldest === undefined) break;
          prewarmRateLimitUntilByChat.delete(oldest);
        }
        console.info(`[preview-prewarm] skipped ${chatId}: subject lease is already active.`);
        return { started: false, reason: "prewarm_rate_limited", message: res.message };
      }
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
