import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { ocDebugFindings } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import { appendBugRegisterEntries } from "@/lib/logging/bug-register";

/**
 * OpenClaw debug-mode bug-hunt findings service (OC_DEBUG).
 *
 * Canonical store is `oc_debug_findings` (Postgres). Bug-level rows
 * (warning/error) are mirrored best-effort into the flat `logs/bug-register.jsonl`
 * export, reusing the same sink as the per-version pipeline findings so the two
 * sources share one register. The DB stays source of truth.
 */

export type DebugFindingSeverity = "info" | "warning" | "error";

export interface DebugFindingPayload {
  runId: string;
  chatId?: string | null;
  versionId?: string | null;
  scenario?: string | null;
  severity: DebugFindingSeverity;
  category?: string | null;
  file?: string | null;
  line?: number | null;
  message: string;
  /** Build/SSG outcome the harness forced for this version, e.g. "passed" / "failed". */
  buildResult?: string | null;
  /** Repair outcome, e.g. "repaired" / "repair_unavailable" / "not_attempted". */
  repairOutcome?: string | null;
  meta?: Record<string, unknown> | null;
}

export type DebugFinding = typeof ocDebugFindings.$inferSelect;

export interface QueryDebugFindingsParams {
  runId?: string;
  versionId?: string;
  severity?: DebugFindingSeverity;
  limit?: number;
}

const DEFAULT_QUERY_LIMIT = 500;

function mapPayload(payload: DebugFindingPayload, now: Date) {
  return {
    id: nanoid(),
    run_id: payload.runId,
    chat_id: payload.chatId ?? null,
    version_id: payload.versionId ?? null,
    scenario: payload.scenario ?? null,
    severity: payload.severity,
    category: payload.category ?? null,
    file: payload.file ?? null,
    line: typeof payload.line === "number" && Number.isFinite(payload.line) ? payload.line : null,
    message: payload.message,
    build_result: payload.buildResult ?? null,
    repair_outcome: payload.repairOutcome ?? null,
    meta: payload.meta ?? null,
    created_at: now,
  };
}

/**
 * Mirror bug-level debug findings to the flat JSONL register. Reuses the
 * pipeline's `appendBugRegisterEntries` sink; `chat_id`/`version_id` can be
 * synthetic in debug runs so we coalesce to a stable label. File/line/scenario
 * ride along in `meta` (the register extracts the standard fields it knows).
 */
function mirrorToBugRegister(payloads: DebugFindingPayload[]): void {
  appendBugRegisterEntries(
    payloads.map((payload) => ({
      chatId: payload.chatId ?? `oc-debug:${payload.runId}`,
      versionId: payload.versionId ?? payload.runId,
      level: payload.severity,
      category: payload.category ? `oc-debug:${payload.category}` : "oc-debug",
      message: payload.file ? `[${payload.file}] ${payload.message}` : payload.message,
      meta: {
        ...(payload.meta ?? {}),
        ocDebugRunId: payload.runId,
        scenario: payload.scenario ?? null,
        buildResult: payload.buildResult ?? null,
        repairOutcome: payload.repairOutcome ?? null,
      },
    })),
  );
}

export async function createDebugFinding(
  payload: DebugFindingPayload,
): Promise<DebugFinding> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(ocDebugFindings)
    .values(mapPayload(payload, now))
    .returning();
  mirrorToBugRegister([payload]);
  return rows[0] as DebugFinding;
}

export async function createDebugFindings(
  payloads: DebugFindingPayload[],
): Promise<DebugFinding[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const rows = await db
    .insert(ocDebugFindings)
    .values(payloads.map((payload) => mapPayload(payload, now)))
    .returning();
  mirrorToBugRegister(payloads);
  return rows as DebugFinding[];
}

export async function listDebugFindingsByRun(
  runId: string,
  limit = DEFAULT_QUERY_LIMIT,
): Promise<DebugFinding[]> {
  assertDbConfigured();
  if (!runId) return [];
  const rows = await db
    .select()
    .from(ocDebugFindings)
    .where(eq(ocDebugFindings.run_id, runId))
    .orderBy(desc(ocDebugFindings.created_at))
    .limit(limit);
  return rows as DebugFinding[];
}

export async function queryDebugFindings(
  params: QueryDebugFindingsParams = {},
): Promise<DebugFinding[]> {
  assertDbConfigured();
  const conditions = [];
  if (params.runId) conditions.push(eq(ocDebugFindings.run_id, params.runId));
  if (params.versionId) conditions.push(eq(ocDebugFindings.version_id, params.versionId));
  if (params.severity) conditions.push(eq(ocDebugFindings.severity, params.severity));

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await db
    .select()
    .from(ocDebugFindings)
    .where(where)
    .orderBy(desc(ocDebugFindings.created_at))
    .limit(params.limit ?? DEFAULT_QUERY_LIMIT);
  return rows as DebugFinding[];
}
