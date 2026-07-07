import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { sortEngineVersionsNewestFirst } from "@/lib/db/engine-version-lifecycle";
import {
  describePreviewDiagnosticCode,
  readPreviewDiagnosticMeta,
} from "@/lib/gen/preview/diagnostics";
import { AUTO_FIX_EVENT_NAME, readAutoFixEventPayload } from "./auto-fix-events";
import type { AutoFixPayload, MessageOptions } from "./types";
import { buildAutoFixPrompt } from "./helpers";

const AUTOFIX_LOCAL_STORAGE_KEY = "sajtmaskin:autofix-enabled";

/** Persisted opt-out only; default is on when key is unset. */
export function readAutofixLocalStorageOnly(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTOFIX_LOCAL_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeAutofixLocalStorage(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.removeItem(AUTOFIX_LOCAL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(AUTOFIX_LOCAL_STORAGE_KEY, "false");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Client-side post-check autofix: **on by default**. Opt out via Settings or
 * localStorage `sajtmaskin:autofix-enabled` = `"false"`, or URL `?noautofix`.
 * `?autofix` forces on for that page load.
 */
function readAutofixClientPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("noautofix")) return false;
    if (params.has("autofix")) return true;
  } catch {
    /* ignore */
  }
  return readAutofixLocalStorageOnly();
}

let lastAutofixDisabledToastAt = 0;
const AUTOFIX_DISABLED_TOAST_COOLDOWN_MS = 12_000;

function notifyAutofixSkipped(reasons: string[]) {
  const now = Date.now();
  if (now - lastAutofixDisabledToastAt < AUTOFIX_DISABLED_TOAST_COOLDOWN_MS) return;
  lastAutofixDisabledToastAt = now;
  const preview = reasons.slice(0, 2).join("; ");
  toast.message("Autofix är avstängt", {
    description:
      `${preview || "Fel hittades"} — slå på Autofix under Settings (kugghjul) eller ta bort ?noautofix från URL:en.`,
    duration: 8_000,
  });
}

let lastAutofixCapToastAt = 0;
const AUTOFIX_CAP_TOAST_COOLDOWN_MS = 30_000;

/**
 * Surface the per-chat autofix cap to the user. Previously the cap was a
 * silent `console.info` only, so the user just saw autofix "stop working"
 * with no explanation. Throttled so a burst of post-checks can't spam toasts.
 */
function notifyAutofixCapReached(max: number) {
  const now = Date.now();
  if (now - lastAutofixCapToastAt < AUTOFIX_CAP_TOAST_COOLDOWN_MS) return;
  lastAutofixCapToastAt = now;
  toast.message("Autofix pausad för den här chatten", {
    description:
      `Automatisk autofix nådde taket (${max} per chatt på kort tid). ` +
      'Kör "Kör autofix" manuellt på versionen, eller höj NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT.',
    duration: 8_000,
  });
}

let lastAutofixBusyToastAt = 0;
const AUTOFIX_BUSY_TOAST_COOLDOWN_MS = 8_000;

/**
 * Manual ("Kör autofix") trigger arrived while another autofix is already
 * scheduled or actively streaming. We refuse to start a second concurrent
 * fix from the same base version (that overlap is the bug cap=1 used to mask),
 * so tell the user to wait instead of failing silently.
 */
function notifyManualAutofixBusy() {
  const now = Date.now();
  if (now - lastAutofixBusyToastAt < AUTOFIX_BUSY_TOAST_COOLDOWN_MS) return;
  lastAutofixBusyToastAt = now;
  toast.message("En autofix körs redan", {
    description: "Vänta tills den pågående autofixen är klar och försök sedan igen.",
    duration: 6_000,
  });
}

// Tak och timing för klient-driven autofix. Override via NEXT_PUBLIC_*
// (klientside-bundling).
//
// Två tak med olika syften — blanda inte ihop dem:
//   - MAX_ATTEMPTS_PER_REASON (1): loop-skydd. Laga ALDRIG exakt samma
//     fel-signatur (canonical reason-key, se makeReasonKey) mer än en gång
//     automatiskt — att köra om på identiskt fel hjälper sällan och
//     riskerar en autofix-loop. Lämnas medvetet på 1.
//   - MAX_AUTOFIX_PER_CHAT (3): totalt antal automatiska fixar per chat
//     inom DEDUPE_TTL_MS-fönstret. Var tidigare 1, vilket var för
//     aggressivt: en generation med flera OLIKA fel fick bara en enda
//     auto-fix och användaren fastnade. 3 låter autofix beta av några
//     skilda problem innan den pausar.
//
// Rollback-säkerheten som motiverade det gamla "1"-taket ligger numera i
// den canonical reason-keyn + isLatestVersionPayload /
// isVersionUnderServerRepair-vakterna, inte i själva chat-taket. Därför är
// det säkert att höja per-chat-taket utan att återintroducera buggen där
// två sekventiella followups skrevs in i samma version (generationslogg
// 235012/235205). Sänk till 1 via NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT=1 om den
// gamla konservativa loopen önskas.
function readClientNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
const MAX_ATTEMPTS_PER_REASON = readClientNumberEnv(
  "NEXT_PUBLIC_AUTOFIX_MAX_PER_REASON",
  1,
);
const MAX_AUTOFIX_PER_CHAT = readClientNumberEnv(
  "NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT",
  3,
);
const DEDUPE_TTL_MS = readClientNumberEnv(
  "NEXT_PUBLIC_AUTOFIX_DEDUPE_TTL_MS",
  5 * 60 * 1000,
);
const SOFT_ONLY_AUTOFIX_REASONS = new Set([
  "misstänkt scaffold-mismatch",
  "planerade routes saknas",
  "saknade routes",
  "route-plan mismatch",
]);

type AttemptEntry = { count: number; ts: number };

type PersistedVersionLog = {
  level?: string | null;
  category?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  versionNumber?: number | null;
  createdAt?: string | Date | null;
  verificationState?: string | null;
};

/**
 * Canonical reason-key for autofix dedupe.
 *
 * The OLD implementation hashed the full `reasons[]` string list, which
 * meant that a quality-gate-fail with reasons `["typecheck failed"]`
 * and a follow-up post-check with `["preview rendering failed",
 * "typecheck failed"]` produced DIFFERENT keys and bypassed the dedupe
 * cap — even though both passes targeted the same underlying failure.
 * That's how two `generationKind=followup` runs landed on the same
 * versionId 52s apart in the Snickar Anders log.
 *
 * New canonical key prefers the structured `repair.qualityGate[].check`
 * set (typecheck/build/lint), falling back to sorted `reasons[]` only
 * when no quality-gate context exists. Same underlying failure → same
 * key → cap holds.
 */
function makeReasonKey(payload: AutoFixPayload): string {
  const checks = payload.repair?.qualityGate
    ?.map((g) => g.check)
    .filter(Boolean);
  if (checks && checks.length > 0) {
    const checkHash = [...new Set(checks)].sort().join("|");
    return `${payload.chatId}:check:${checkHash}`;
  }
  const reasonHash = payload.reasons.slice().sort().join("|");
  return `${payload.chatId}:reason:${reasonHash}`;
}

function makeChatKey(chatId: string): string {
  return `chat-total:${chatId}`;
}

function pruneStale(map: Record<string, AttemptEntry>, now: number) {
  for (const key of Object.keys(map)) {
    if (now - map[key].ts > DEDUPE_TTL_MS) {
      delete map[key];
    }
  }
}

function truncateDiagnostic(value: string, max = 500): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function extractMetaDiagnosticLines(log: PersistedVersionLog): string[] {
  const category = typeof log.category === "string" ? log.category.trim() : "";
  const meta = log.meta && typeof log.meta === "object" ? log.meta : null;
  if (!meta) return [];

  const lines: string[] = [];
  const pushLine = (label: string, value: string) => {
    const truncated = truncateDiagnostic(value);
    if (truncated) lines.push(`[${label}] ${truncated}`);
  };

  const previewMeta = readPreviewDiagnosticMeta(meta);
  if (previewMeta.previewCode) {
    const description = describePreviewDiagnosticCode(previewMeta.previewCode);
    if (description) {
      pushLine(`preview:${previewMeta.previewCode}`, description);
    }
  }
  if (previewMeta.previewStage) {
    pushLine(`${category || "log"}:stage`, previewMeta.previewStage);
  }

  if (typeof meta.output === "string" && meta.output.trim()) {
    pushLine(`${category || "log"}:output`, meta.output);
  }
  if (typeof meta.message === "string" && meta.message.trim()) {
    pushLine(`${category || "log"}:detail`, meta.message);
  }
  if (typeof meta.error === "string" && meta.error.trim()) {
    pushLine(`${category || "log"}:error`, meta.error);
  }
  if (typeof meta.stack === "string" && meta.stack.trim()) {
    pushLine(`${category || "log"}:stack`, meta.stack);
  }
  if (Array.isArray(meta.issues) && meta.issues.length > 0) {
    const issuePreview = meta.issues
      .slice(0, 6)
      .map((issue) => {
        if (typeof issue === "string") return issue;
        if (issue && typeof issue === "object") {
          const file = typeof (issue as { file?: unknown }).file === "string"
            ? (issue as { file: string }).file
            : null;
          const message = typeof (issue as { message?: unknown }).message === "string"
            ? (issue as { message: string }).message
            : JSON.stringify(issue);
          return file ? `${file}: ${message}` : message;
        }
        return "";
      })
      .filter(Boolean)
      .join(" | ");
    pushLine(`${category || "log"}:issues`, issuePreview);
  }
  if (Array.isArray(meta.warnings) && meta.warnings.length > 0) {
    const warningPreview = meta.warnings
      .slice(0, 4)
      .map((warning) => (typeof warning === "string" ? warning : JSON.stringify(warning)))
      .join(" | ");
    pushLine(`${category || "log"}:warnings`, warningPreview);
  }
  if (Array.isArray(meta.broken) && meta.broken.length > 0) {
    const brokenPreview = meta.broken
      .slice(0, 4)
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(" | ");
    pushLine(`${category || "log"}:broken`, brokenPreview);
  }
  if (Array.isArray(meta.files) && meta.files.length > 0) {
    const filePreview = meta.files
      .slice(0, 5)
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const fileName = typeof (entry as { fileName?: unknown }).fileName === "string"
            ? (entry as { fileName: string }).fileName
            : "unknown";
          const issueCount = typeof (entry as { issueCount?: unknown }).issueCount === "number"
            ? (entry as { issueCount: number }).issueCount
            : null;
          return issueCount !== null ? `${fileName} (${issueCount})` : fileName;
        }
        return typeof entry === "string" ? entry : "";
      })
      .filter(Boolean)
      .join(", ");
    pushLine(`${category || "log"}:files`, filePreview);
  }

  return lines;
}

function isNoiseForAutoFix(log: PersistedVersionLog): boolean {
  const level = typeof log.level === "string" ? log.level.trim() : "";
  const category = typeof log.category === "string" ? log.category.trim() : "";
  const message = typeof log.message === "string" ? log.message.trim() : "";
  if (level === "info") return true;
  if (!message) return true;
  if (category === "preflight:summary") return true;
  if (message.includes("Preview rendered successfully")) return true;
  return false;
}

function isBlockingAutoFixLog(log: PersistedVersionLog): boolean {
  const category = typeof log.category === "string" ? log.category.trim() : "";
  return (
    category === "preview" ||
    category === "render-telemetry" ||
    category === "css" ||
    category === "react" ||
    category === "syntax" ||
    category === "routes" ||
    category === "quality-gate" ||
    category === "preflight:issues" ||
    category.startsWith("quality-gate:")
  );
}

export function summarizeVersionLogsForAutoFix(logs: PersistedVersionLog[]): string[] {
  const relevant = logs.filter((log) => !isNoiseForAutoFix(log));
  const hasBlockingDiagnostics = relevant.some(isBlockingAutoFixLog);
  const filtered = relevant.filter((log) => {
    const category = typeof log.category === "string" ? log.category.trim() : "";
    if (!hasBlockingDiagnostics) return true;
    return category !== "seo";
  });

  const lines: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    lines.push(trimmed);
  };

  for (const log of filtered.slice(0, 8)) {
    const message = typeof log.message === "string" ? log.message.trim() : "";
    const category = typeof log.category === "string" ? log.category.trim() : "";
    pushUnique(category ? `[${category}] ${message}` : message);
    for (const detail of extractMetaDiagnosticLines(log)) {
      pushUnique(detail);
      if (lines.length >= 16) break;
    }
    if (lines.length >= 16) break;
  }

  return lines;
}

async function loadVersionErrorSummary(chatId: string, versionId: string): Promise<string[]> {
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      { method: "GET" },
    );
    if (!response.ok) return [];
    const data = (await response.json().catch(() => null)) as
      | { logs?: PersistedVersionLog[] }
      | null;
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    return summarizeVersionLogsForAutoFix(logs);
  } catch {
    return [];
  }
}

async function enrichAutoFixPayload(payload: AutoFixPayload): Promise<AutoFixPayload> {
  const previousVersionId =
    typeof payload.meta?.previousVersionId === "string" ? payload.meta.previousVersionId : null;

  const [currentVersionErrors, previousVersionErrors] = await Promise.all([
    loadVersionErrorSummary(payload.chatId, payload.versionId),
    previousVersionId ? loadVersionErrorSummary(payload.chatId, previousVersionId) : Promise.resolve([]),
  ]);

  if (currentVersionErrors.length === 0 && previousVersionErrors.length === 0) {
    return payload;
  }

  return {
    ...payload,
    repair: {
      ...(payload.repair ?? {}),
      currentVersionErrors,
      previousVersionErrors,
    },
  };
}

async function getLatestChatVersionId(chatId: string): Promise<string | null> {
  try {
    const response = await fetch(`${engineChatBaseUrl(chatId)}/versions`, {
      method: "GET",
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as
      | { versions?: VersionSummary[] }
      | null;
    const versions = Array.isArray(data?.versions) ? data.versions : [];
    if (versions.length === 0) return null;
    const newest = sortEngineVersionsNewestFirst(versions)[0];
    return (newest?.versionId || newest?.id || null) ?? null;
  } catch {
    return null;
  }
}

async function isLatestVersionPayload(payload: AutoFixPayload): Promise<boolean> {
  const latestVersionId = await getLatestChatVersionId(payload.chatId);
  if (!latestVersionId) return true;
  return latestVersionId === payload.versionId;
}

async function isVersionUnderServerRepair(chatId: string, versionId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/readiness?versionId=${encodeURIComponent(versionId)}`,
      { method: "GET" },
    );
    if (!response.ok) return false;
    // The /readiness route answers `{ success, readiness: { ..., info: {
    // lifecycleStatus, lifecycleStage, ... } } }` — NOT a top-level
    // `verificationState`. The old parse read `data.verificationState`, which is
    // always `undefined`, so this guard silently never triggered and client
    // autofix could stream into a version while a server-side repair was
    // mutating it. Parse the real nested shape instead.
    const data = (await response.json().catch(() => null)) as
      | {
          readiness?: {
            info?: {
              lifecycleStatus?: string | null;
              lifecycleStage?: string | null;
            } | null;
          } | null;
        }
      | null;
    const info = data?.readiness?.info;
    const status = typeof info?.lifecycleStatus === "string" ? info.lifecycleStatus : "";
    const stage = typeof info?.lifecycleStage === "string" ? info.lifecycleStage : "";
    // `repairing` / `repair_available` are unambiguous server-repair states: a
    // server-side repair is actively mutating the version, or a repaired version
    // is awaiting acceptance — never run client autofix on top of either.
    if (status === "repairing" || status === "repair_available") return true;
    // `verifying` means an ACTIVE server-verify only for F3 (`integrations`)
    // rows. F2 (`design`) rows sit in the same `verifying` lifecycle status while
    // merely pending — design preview skips server-verify
    // (`design_preview_skip_verify`), so the row never leaves `verifying` even
    // though nothing is running. Treating that as "under server repair" would
    // permanently block client autofix on every F2 version, which is exactly
    // when post-check autofix is supposed to run. So only block on `verifying`
    // when the stage is `integrations`.
    if (status === "verifying" && stage === "integrations") return true;
    return false;
  } catch {
    return false;
  }
}

export function useAutoFix(
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>,
  /**
   * Returns the currently active chatId. Used to skip a scheduled autofix whose
   * payload belongs to a chat the user has since navigated away from — otherwise
   * a post-check for chat A can stream into whatever chat is now active. Optional
   * and fail-open: when omitted or returning null/undefined, no chat guard runs.
   */
  getActiveChatId?: () => string | null | undefined,
) {
  const autoFixAttemptsRef = useRef<Record<string, AttemptEntry>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadKeyRef = useRef<string | null>(null);
  const autoFixInFlightRef = useRef(false);

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      if (!readAutofixClientPreference()) {
        notifyAutofixSkipped(payload.reasons);
        return;
      }
      if (
        payload.reasons.length > 0 &&
        payload.reasons.every((reason) => SOFT_ONLY_AUTOFIX_REASONS.has(reason))
      ) {
        return;
      }
      const isManual = payload.manual === true;
      void (async () => {
        // In-flight gate covers the WHOLE lifecycle (event accepted → scheduled
        // → `sendMessage` resolved), not just the pre-schedule prelude. This is
        // what actually prevents two autofixes from streaming into the same base
        // version concurrently — the overlap the old cap=1 only accidentally
        // masked.
        if (autoFixInFlightRef.current) {
          if (isManual) notifyManualAutofixBusy();
          return;
        }
        autoFixInFlightRef.current = true;
        let scheduled = false;
        try {
          const now = Date.now();
          pruneStale(autoFixAttemptsRef.current, now);

          const chatKey = makeChatKey(payload.chatId);
          const chatTotal = autoFixAttemptsRef.current[chatKey]?.count ?? 0;
          // Manual triggers bypass the throttles (they guard automatic loops,
          // not explicit user clicks) but still go through every safety guard
          // below.
          if (!isManual && chatTotal >= MAX_AUTOFIX_PER_CHAT) {
            if (typeof window !== "undefined") {
              console.info(
                "[autofix] chat-cap reached",
                { chatId: payload.chatId, max: MAX_AUTOFIX_PER_CHAT, chatTotal },
              );
              notifyAutofixCapReached(MAX_AUTOFIX_PER_CHAT);
            }
            return;
          }

          const reasonKey = makeReasonKey(payload);
          const reasonAttempts = autoFixAttemptsRef.current[reasonKey]?.count ?? 0;
          if (!isManual && reasonAttempts >= MAX_ATTEMPTS_PER_REASON) {
            if (typeof window !== "undefined") {
              console.info(
                "[autofix] reason-cap reached",
                { chatId: payload.chatId, reasonKey, max: MAX_ATTEMPTS_PER_REASON },
              );
            }
            return;
          }

          if (!(await isLatestVersionPayload(payload))) return;

          const enrichedPayload = await enrichAutoFixPayload(payload);
          const prompt = buildAutoFixPrompt(enrichedPayload);
          const scaffoldRetry =
            enrichedPayload.repair?.scaffoldRetry
            ?? (enrichedPayload.meta?.scaffoldRetry && typeof enrichedPayload.meta.scaffoldRetry === "object"
              ? (enrichedPayload.meta.scaffoldRetry as Record<string, unknown>)
              : null);
          const retryScaffoldId =
            scaffoldRetry && typeof scaffoldRetry.suggestedScaffoldId === "string"
              ? scaffoldRetry.suggestedScaffoldId
              : null;
          const delayMs = isManual ? 0 : chatTotal === 0 ? 1500 : 4000;

          pendingPayloadKeyRef.current = reasonKey;
          scheduled = true;

          pendingTimerRef.current = setTimeout(() => {
            pendingTimerRef.current = null;
            void (async () => {
              try {
                if (pendingPayloadKeyRef.current !== reasonKey) return;
                // Skip if the user navigated to a different chat since this
                // autofix was scheduled — never apply chat A's fix to chat B.
                // Fail-open when the active chat is unknown (getter absent/null).
                const activeChatId = getActiveChatId?.();
                if (activeChatId != null && activeChatId !== payload.chatId) return;
                if (!(await isLatestVersionPayload(payload))) return;
                if (await isVersionUnderServerRepair(payload.chatId, payload.versionId)) return;
                pendingPayloadKeyRef.current = null;

                // Count the attempt only now that a real send is actually
                // starting, and only for AUTOMATIC fixes. Counting at schedule
                // time (the old behaviour) let timers that were later aborted by
                // the guards above silently consume the budget; counting manual
                // sends here would let a user-initiated fix starve the automatic
                // per-chat/per-reason budget for later post-checks.
                if (!isManual) {
                  const ts = Date.now();
                  autoFixAttemptsRef.current[reasonKey] = {
                    count: (autoFixAttemptsRef.current[reasonKey]?.count ?? 0) + 1,
                    ts,
                  };
                  autoFixAttemptsRef.current[chatKey] = {
                    count: (autoFixAttemptsRef.current[chatKey]?.count ?? 0) + 1,
                    ts,
                  };
                }

                const messageOptions: MessageOptions = {
                  engineBaseVersionIdOverride: payload.versionId,
                  promptSourceMeta: {
                    sourceKind: "autofix",
                    isTechnical: true,
                    preservePayload: true,
                  },
                };
                if (retryScaffoldId) {
                  messageOptions.scaffoldModeOverride = "manual";
                  messageOptions.scaffoldIdOverride = retryScaffoldId;
                }
                await sendMessage(prompt, messageOptions);
              } finally {
                // The scheduled cycle owns the in-flight gate until its send
                // resolves/rejects, so a second autofix can't overlap it.
                autoFixInFlightRef.current = false;
              }
            })();
          }, delayMs);
        } finally {
          // If we bailed before scheduling (capped / stale / soft-only), release
          // the gate here. Once scheduled, the timer callback's finally owns it.
          if (!scheduled) autoFixInFlightRef.current = false;
        }
      })();
    },
    [sendMessage, getActiveChatId],
  );

  useEffect(() => {
    autoFixHandlerRef.current = handleAutoFix;
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = readAutoFixEventPayload(event);
      if (!payload) return;
      handleAutoFix(payload);
    };
    window.addEventListener(AUTO_FIX_EVENT_NAME, handler as EventListener);
    return () => {
      window.removeEventListener(AUTO_FIX_EVENT_NAME, handler as EventListener);
      if (pendingTimerRef.current) {
        // Cancelling a still-pending send means its timer callback (which owns
        // the in-flight release) will never run. Release the gate here too, or
        // the hook would stay permanently "busy" after a sendMessage-identity
        // change and silently drop every later autofix.
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
        autoFixInFlightRef.current = false;
      }
      pendingPayloadKeyRef.current = null;
    };
  }, [handleAutoFix]);

  return { autoFixHandlerRef };
}
