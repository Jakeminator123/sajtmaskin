/**
 * HTTP implementation of `BugHuntEngineClient` for the debug-mode bug-hunt.
 *
 * Drives the REAL engine endpoints the builder UI uses:
 *   - POST /api/engine/chats/stream                      (create chat)
 *   - POST /api/engine/chats/{chatId}/stream             (follow-up)
 *   - GET  /api/engine/chats/{chatId}/versions           (discover newest version)
 *   - GET  /api/engine/chats/{chatId}/version-status     (settle poll)
 *   - POST /api/engine/chats/{chatId}/quality-gate       (forced real build)
 *   - POST /api/engine/chats/{chatId}/repair             (bounded repair)
 *   - GET  /api/engine/chats/{chatId}/versions/{id}/error-log  (findings)
 *
 * Auth: the caller forwards an authenticated owner session (cookie / bearer) so
 * generated chats belong to the owner / debug tenant. Read-only against the
 * platform repo is a separate module — this client never writes Sajtmaskin code.
 *
 * Tolerant by design: SSE/JSON shapes vary across the pipeline, so id discovery
 * scans defensively and falls back to the versions list. All calls are timed
 * and guarded so a single hung request can't stall the run forever.
 */

import { sortEngineVersionsNewestFirst } from "@/lib/db/engine-version-lifecycle";
import type {
  BugHuntEngineClient,
  EngineBuildResult,
  EngineErrorLogRow,
  EngineRepairResult,
  EngineVersionRef,
} from "./bug-hunt";

export interface HttpEngineClientOptions {
  /** App base URL, e.g. http://localhost:3000 (no trailing slash needed). */
  baseUrl: string;
  /** Forwarded auth headers from the authenticated owner (cookie + authorization). */
  authHeaders?: Record<string, string>;
  /** Model tier for created chats. Defaults to "fast" (Max Fast). */
  modelId?: string;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (ms). */
  requestTimeoutMs?: number;
  /** Max polls while waiting for a version to settle. */
  settleMaxPolls?: number;
  /** Delay between settle polls (ms). */
  settlePollIntervalMs?: number;
}

const TRANSIENT_STATUS_HINTS = [
  "verifying",
  "repairing",
  "generating",
  "streaming",
  "pending",
  "queued",
  "in_progress",
  "working",
];

function isTransientStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const s = status.toLowerCase();
  return TRANSIENT_STATUS_HINTS.some((hint) => s.includes(hint));
}

function collectIdFields(value: unknown, out: { chatId?: string; versionId?: string }): void {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      const lower = key.toLowerCase();
      if (lower === "chatid" && !out.chatId) out.chatId = v;
      if (lower === "versionid" && !out.versionId) out.versionId = v;
    } else if (v && typeof v === "object") {
      collectIdFields(v, out);
    }
  }
}

function extractIdsFromSse(text: string): { chatId?: string; versionId?: string } {
  const out: { chatId?: string; versionId?: string } = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      collectIdFields(JSON.parse(payload), out);
    } catch {
      // ignore malformed chunks
    }
  }
  return out;
}

export function createHttpEngineClient(
  options: HttpEngineClientOptions,
): BugHuntEngineClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const modelId = options.modelId ?? "fast";
  const timeoutMs = options.requestTimeoutMs ?? 290_000;
  const settleMaxPolls = options.settleMaxPolls ?? 120;
  const settlePollIntervalMs = options.settlePollIntervalMs ?? 3_000;

  const headers = (extra?: Record<string, string>): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(options.authHeaders ?? {}),
    ...(extra ?? {}),
  });

  async function readNewestVersionId(chatId: string): Promise<string | null> {
    try {
      const res = await doFetch(`${baseUrl}/api/engine/chats/${chatId}/versions`, {
        method: "GET",
        headers: headers(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as
        | { versions?: Array<Record<string, unknown>> }
        | null;
      const list = Array.isArray(data?.versions) ? data.versions : [];
      if (list.length === 0) return null;
      const newest = sortEngineVersionsNewestFirst(
        list as Array<{ versionId?: string | null; id?: string | null; versionNumber?: number | null; createdAt?: string | null }>,
      )[0];
      return (newest?.versionId as string) || (newest?.id as string) || null;
    } catch {
      return null;
    }
  }

  async function consumeStreamAndResolveRef(
    res: Response,
    knownChatId?: string,
  ): Promise<EngineVersionRef> {
    const text = await res.text().catch(() => "");
    const ids = extractIdsFromSse(text);
    const chatId = knownChatId ?? ids.chatId ?? "";
    let versionId = ids.versionId ?? "";
    if (chatId && !versionId) {
      versionId = (await readNewestVersionId(chatId)) ?? "";
    }
    return { chatId, versionId };
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async createChat({ prompt }): Promise<EngineVersionRef> {
      const res = await doFetch(`${baseUrl}/api/engine/chats/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: prompt,
          modelId,
          thinking: false,
          imageGenerations: false,
          chatPrivacy: "private",
          meta: { promptSourceKind: "oc-debug" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`createChat failed: HTTP ${res.status}`);
      }
      return consumeStreamAndResolveRef(res);
    },

    async sendFollowUp({ chatId, prompt }): Promise<EngineVersionRef> {
      const res = await doFetch(`${baseUrl}/api/engine/chats/${chatId}/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: prompt,
          modelId,
          thinking: false,
          imageGenerations: false,
          meta: { promptSourceKind: "oc-debug" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`sendFollowUp failed: HTTP ${res.status}`);
      }
      return consumeStreamAndResolveRef(res, chatId);
    },

    async waitForVersionSettled(ref: EngineVersionRef): Promise<{ state: string }> {
      let lastState = "unknown";
      for (let i = 0; i < settleMaxPolls; i += 1) {
        try {
          const res = await doFetch(
            `${baseUrl}/api/engine/chats/${ref.chatId}/version-status?versionId=${encodeURIComponent(ref.versionId)}`,
            { method: "GET", headers: headers(), signal: AbortSignal.timeout(timeoutMs) },
          );
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as
              | { status?: unknown }
              | null;
            const status =
              typeof data?.status === "string"
                ? data.status
                : typeof (data?.status as { kind?: string })?.kind === "string"
                  ? (data!.status as { kind: string }).kind
                  : "unknown";
            lastState = status;
            if (!isTransientStatus(status)) return { state: status };
          }
        } catch {
          // transient network error — keep polling
        }
        await sleep(settlePollIntervalMs);
      }
      return { state: lastState };
    },

    async forceBuild(ref: EngineVersionRef): Promise<EngineBuildResult> {
      try {
        const res = await doFetch(`${baseUrl}/api/engine/chats/${ref.chatId}/quality-gate`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            versionId: ref.versionId,
            checks: ["typecheck", "build", "lint"],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 501) {
          return { result: "unknown", detail: "quality gate not configured" };
        }
        if (!res.ok) {
          return { result: "unknown", detail: `HTTP ${res.status}` };
        }
        const data = (await res.json().catch(() => null)) as
          | { passed?: boolean; checks?: unknown }
          | null;
        return {
          result: data?.passed === true ? "passed" : data?.passed === false ? "failed" : "unknown",
          detail: undefined,
        };
      } catch (err) {
        return { result: "unknown", detail: err instanceof Error ? err.message : "error" };
      }
    },

    async repair(ref: EngineVersionRef): Promise<EngineRepairResult> {
      try {
        const res = await doFetch(`${baseUrl}/api/engine/chats/${ref.chatId}/repair`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ versionId: ref.versionId, repairContext: {} }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          return { outcome: `repair_http_${res.status}`, versionId: ref.versionId };
        }
        const data = (await res.json().catch(() => null)) as
          | { status?: string; repaired?: boolean; newVersionId?: string | null }
          | null;
        return {
          outcome: data?.status || (data?.repaired ? "repaired" : "completed"),
          versionId: data?.newVersionId || ref.versionId,
        };
      } catch (err) {
        return { outcome: err instanceof Error ? err.message : "repair_error", versionId: ref.versionId };
      }
    },

    async getErrorLogs(versionId: string): Promise<EngineErrorLogRow[]> {
      // The error-log GET is chat-scoped; we don't carry chatId here, so this is
      // resolved by the route which knows the chat. When used standalone without
      // a chat-scoped endpoint, return empty (the route injects a DB-backed
      // getErrorLogs instead). Kept for interface completeness.
      void versionId;
      return [];
    },
  };
}
