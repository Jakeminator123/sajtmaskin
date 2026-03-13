import { useCallback, useEffect, useRef } from "react";
import { sortEngineVersionsNewestFirst } from "@/lib/db/engine-version-lifecycle";
import {
  describePreviewDiagnosticCode,
  readPreviewDiagnosticMeta,
} from "@/lib/gen/preview-diagnostics";
import type { AutoFixPayload, MessageOptions } from "./types";
import { buildAutoFixPrompt } from "./helpers";

const MAX_ATTEMPTS_PER_KEY = 2;
const DEDUPE_TTL_MS = 5 * 60 * 1000;

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

function makeDedupeKey(payload: AutoFixPayload): string {
  const reasonHash = payload.reasons.slice().sort().join("|");
  return `${payload.chatId}:${payload.versionId}:${reasonHash}`;
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
      `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
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
    meta: {
      ...(payload.meta ?? {}),
      currentVersionErrors,
      previousVersionErrors,
    },
  };
}

async function getLatestChatVersionId(chatId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/v0/chats/${encodeURIComponent(chatId)}/versions`, {
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

export function useAutoFix(
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>,
) {
  const autoFixAttemptsRef = useRef<Record<string, AttemptEntry>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadKeyRef = useRef<string | null>(null);

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      void (async () => {
        const now = Date.now();
        pruneStale(autoFixAttemptsRef.current, now);

        const key = makeDedupeKey(payload);
        const entry = autoFixAttemptsRef.current[key];
        const attempts = entry?.count ?? 0;
        if (attempts >= MAX_ATTEMPTS_PER_KEY) return;

        if (!(await isLatestVersionPayload(payload))) return;

        autoFixAttemptsRef.current[key] = { count: attempts + 1, ts: now };

        const enrichedPayload = await enrichAutoFixPayload(payload);
        const prompt = buildAutoFixPrompt(enrichedPayload);
        const delayMs = attempts === 0 ? 1500 : 4000;

        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        pendingPayloadKeyRef.current = key;

        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          void (async () => {
            if (pendingPayloadKeyRef.current !== key) return;
            if (!(await isLatestVersionPayload(payload))) return;
            pendingPayloadKeyRef.current = null;
            await sendMessage(prompt);
          })();
        }, delayMs);
      })();
    },
    [sendMessage],
  );

  useEffect(() => {
    autoFixHandlerRef.current = handleAutoFix;
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<AutoFixPayload>).detail;
      if (!payload?.chatId || !payload?.versionId) return;
      handleAutoFix(payload);
    };
    window.addEventListener("sajtmaskin:auto-fix", handler as EventListener);
    return () => {
      window.removeEventListener("sajtmaskin:auto-fix", handler as EventListener);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingPayloadKeyRef.current = null;
    };
  }, [handleAutoFix]);

  return { autoFixHandlerRef };
}
