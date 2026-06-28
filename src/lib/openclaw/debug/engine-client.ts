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
import type { VersionStatusPhase } from "@/lib/logging/event-bus-types";
import type {
  BugHuntEngineClient,
  EngineBuildResult,
  EngineErrorLogRow,
  EngineRepairContext,
  EngineRepairGateFailure,
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
  /**
   * App project id minted debug chats are created under, sent as
   * `meta.appProjectId`. The real create-chat route requires this (or
   * `projectId`) and 400s otherwise. Must be owned by the forwarded session.
   */
  appProjectId?: string;
  /** Legacy/v0 project id fallback, sent as top-level `projectId`. */
  projectId?: string;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (ms) for generation/build calls. */
  requestTimeoutMs?: number;
  /**
   * Max polls while waiting for a version to settle. The default keeps the
   * worst-case settle wait (settleMaxPolls * settlePollIntervalMs) safely under
   * the run route's maxDuration so a stuck version doesn't run the invocation
   * past its serverless ceiling (Bugbot).
   */
  settleMaxPolls?: number;
  /** Delay between settle polls (ms). */
  settlePollIntervalMs?: number;
  /** Short per-poll timeout (ms) for the version-status read — a hung status
   * read must not consume the full generation `requestTimeoutMs`. */
  settleRequestTimeoutMs?: number;
}

/**
 * Terminal `VersionStatus.phase` values: generation is no longer in flight.
 * `blocked` is terminal-with-blockers (preview/verify blockers) — the harness
 * still force-builds it; `idle`/`done`/`failed` are likewise settled. Everything
 * else (`streaming`/`autofixing`/`validating`/`preflighting`/`verifying`/
 * `repairing`) is still in flight, so the harness must keep polling instead of
 * forcing a gate against a streaming version (Codex P1).
 */
const SETTLED_PHASES = new Set<VersionStatusPhase>([
  "idle",
  "blocked",
  "done",
  "failed",
]);

/**
 * `/version-status` returns `{ status: VersionStatus }` whose `phase` field is
 * the authoritative lifecycle state (NOT `kind`). Tolerant of a bare-string
 * `status` for forward-compat. Returns the phase string + whether it is settled.
 */
function readVersionPhase(data: unknown): { phase: string; settled: boolean } {
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status === "string") {
    return { phase: status, settled: (SETTLED_PHASES as Set<string>).has(status) };
  }
  if (status && typeof status === "object") {
    const obj = status as { phase?: unknown; done?: unknown };
    const phase = typeof obj.phase === "string" ? obj.phase : "unknown";
    const settled =
      obj.done === true || (SETTLED_PHASES as Set<string>).has(phase);
    return { phase, settled };
  }
  return { phase: "unknown", settled: false };
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
  const appProjectId = options.appProjectId?.trim() || undefined;
  const projectId = options.projectId?.trim() || undefined;
  const timeoutMs = options.requestTimeoutMs ?? 290_000;
  // 80 * 3s = 240s worst-case settle wait, under the run route's 300s
  // maxDuration (Bugbot). createChat already drains the generation stream, so a
  // settled version normally resolves in 1-2 polls; the cap only bounds a stuck
  // version.
  const settleMaxPolls = options.settleMaxPolls ?? 80;
  const settlePollIntervalMs = options.settlePollIntervalMs ?? 3_000;
  const settleRequestTimeoutMs = options.settleRequestTimeoutMs ?? 20_000;

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
          // The create-chat route resolves the chat's project from
          // projectId/meta.appProjectId and 400s when neither is present
          // (Codex P1). Carry the owned debug project id so Mode B's first
          // createChat succeeds.
          ...(projectId ? { projectId } : {}),
          meta: {
            promptSourceKind: "oc-debug",
            ...(appProjectId ? { appProjectId } : {}),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`createChat failed: HTTP ${res.status}`);
      }
      return consumeStreamAndResolveRef(res);
    },

    async sendFollowUp({ chatId, prompt, baseVersionId }): Promise<EngineVersionRef> {
      const res = await doFetch(`${baseUrl}/api/engine/chats/${chatId}/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: prompt,
          modelId,
          thinking: false,
          imageGenerations: false,
          meta: {
            promptSourceKind: "oc-debug",
            // Build the follow-up FROM the version the harness just settled, not
            // the server's latest/preferred one (Bugbot HIGH). Sent as an
            // explicit base WITHOUT engineLatestKnownVersionId so it is exempt
            // from the stale-base 409 gate — the harness deliberately chains off
            // its own settled version.
            ...(baseVersionId ? { engineBaseVersionId: baseVersionId } : {}),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`sendFollowUp failed: HTTP ${res.status}`);
      }
      return consumeStreamAndResolveRef(res, chatId);
    },

    async waitForVersionSettled(ref: EngineVersionRef): Promise<{ state: string; settled: boolean }> {
      let lastState = "unknown";
      for (let i = 0; i < settleMaxPolls; i += 1) {
        try {
          const res = await doFetch(
            `${baseUrl}/api/engine/chats/${ref.chatId}/version-status?versionId=${encodeURIComponent(ref.versionId)}`,
            { method: "GET", headers: headers(), signal: AbortSignal.timeout(settleRequestTimeoutMs) },
          );
          if (res.ok) {
            const data = await res.json().catch(() => null);
            // `/version-status` returns `{ status: VersionStatus }` keyed by
            // `phase` (NOT `kind`); reading `kind` made every poll resolve to
            // "unknown" and exit on the first poll, forcing gates against a
            // still-streaming version (Codex P1).
            const { phase, settled } = readVersionPhase(data);
            lastState = phase;
            if (settled) return { state: phase, settled: true };
          }
        } catch {
          // transient network error — keep polling
        }
        await sleep(settlePollIntervalMs);
      }
      // Poll budget exhausted while still transient — report NOT settled so the
      // caller doesn't force a gate against a still-generating version (Bugbot).
      return { state: lastState, settled: false };
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
          | {
              passed?: boolean;
              firstFailureCheck?: string | null;
              checks?: Array<{
                check?: string;
                passed?: boolean;
                exitCode?: number;
                output?: string;
                durationMs?: number | null;
              }>;
            }
          | null;
        // Carry failed checks so repair has actionable context. Only the three
        // gate checks the repair endpoint accepts are kept.
        const allowed = new Set(["typecheck", "build", "lint"]);
        const qualityGate: EngineRepairGateFailure[] = Array.isArray(data?.checks)
          ? data!.checks
              .filter((c) => c && c.passed === false && allowed.has(String(c.check)))
              .map((c) => ({
                check: c.check as EngineRepairGateFailure["check"],
                exitCode: typeof c.exitCode === "number" ? c.exitCode : 1,
                output: typeof c.output === "string" ? c.output : "",
                durationMs: typeof c.durationMs === "number" ? c.durationMs : null,
              }))
          : [];
        return {
          result: data?.passed === true ? "passed" : data?.passed === false ? "failed" : "unknown",
          qualityGate,
          firstFailureCheck:
            typeof data?.firstFailureCheck === "string" ? data.firstFailureCheck : null,
        };
      } catch (err) {
        return { result: "unknown", detail: err instanceof Error ? err.message : "error" };
      }
    },

    async repair(
      ref: EngineVersionRef,
      context?: EngineRepairContext,
    ): Promise<EngineRepairResult> {
      try {
        const res = await doFetch(`${baseUrl}/api/engine/chats/${ref.chatId}/repair`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            versionId: ref.versionId,
            repairContext: context ?? {},
          }),
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
