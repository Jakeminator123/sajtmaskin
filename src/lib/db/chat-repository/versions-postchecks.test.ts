import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { alias, PgDialect } from "drizzle-orm/pg-core";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, receipts: [] as Array<Record<string, unknown>>,
  conditions: [] as string[], latestOrders: [] as unknown[], owner: "u" as string | null, session: "s" as string | null,
  billing: true, imported: false, pageSize: 64 }));
vi.mock("../services/version-errors", () => ({ SERVER_REPAIR_BUDGET_LOG_CATEGORY: "server-repair:budget" }));
vi.mock("./version-lifecycle", () => ({ promoteVersion: vi.fn() }));
vi.mock("../client", async () => {
  const { engineVersions } = await import("../schema");
  return { dbConfigured: true, db: {
    selectDistinctOn: (keys: unknown[]) => ({ from: () => ({ orderBy: (...order: unknown[]) => {
      state.latestOrders = [...keys, ...order];
      return { as: (name: string) => alias(engineVersions, name) };
    } }) }),
    select: () => ({ from: (table: Table) => {
      const name = getTableName(table);
      const builder = {
        innerJoin: () => builder, leftJoin: () => builder,
        where: (condition: SQL) => {
          const query = new PgDialect().sqlToQuery(condition); state.conditions.push(query.sql);
          const params = query.params;
          if (name === "engine_version_error_logs") return Promise.resolve(state.receipts.filter(row => params.includes(row.versionId)));
          const limit = async () => {
            if (name === "latest_postcheck_version") {
              const newest = new Map<string, Record<string, unknown>>();
              for (const row of state.rows) if (Number(newest.get(String(row.chatId))?.versionNumber ?? -1) < Number(row.versionNumber)) newest.set(String(row.chatId), row);
              const cursor = params.find(value => typeof value === "string" && value.startsWith("v_")) as string | undefined;
              return [...newest.values()].filter(row => row.releaseState === "draft" && ["pending", "verifying", "repairing"].includes(String(row.verificationState)) &&
                row.repairedFilesJson == null && (!cursor || String(row.id) > cursor))
                .sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, state.pageSize);
            }
            const version = state.rows.find(row => params.includes(row.id) && params.includes(row.chatId));
            if (!version) return [];
            return [{ version, projectId: "app-project", userId: state.owner, sessionId: state.session,
              billingId: state.billing ? "existing-marker" : null, imported: state.imported,
              latest: !state.rows.some(row => row.chatId === version.chatId && Number(row.versionNumber) > Number(version.versionNumber)) }];
          };
          return { limit, orderBy: () => ({ limit }) };
        },
      };
      return builder;
    } }),
  } };
});
import { getServerPostcheckTarget, listServerPostcheckCandidates } from "./versions";

describe("canonical latest-first server candidates and stored identity", () => {
  const NOW = Date.UTC(2026, 9, 12, 10);
  const receiptId = (versionId: string, kind: string) => "server-repair-budget:" + createHash("sha256").update(JSON.stringify([versionId, kind])).digest("hex");
  const version = (id: string, chatId = id, versionNumber = 1) => ({ id, chatId, versionNumber, filesRevision: "revision", filesJson: "[]",
    createdAt: new Date(NOW - 600_000), editKind: null, lifecycleStage: "design", releaseState: "draft", verificationState: "pending", verificationSummary: null });
  function init(row: ReturnType<typeof version>, canStartPreview = true, hasBuildBreakingFindings = false) {
    return { id: receiptId(row.id, "init"), category: "server-repair:budget", versionId: row.id, meta: {
      kind: "init", schema: 1, chatId: row.chatId, versionId: row.id, filesRevision: row.filesRevision, scopeId: row.id + ":original",
      maxPasses: SERVER_REPAIR_MAX_PASSES, history: { source: "observed_fixer_calls", finalize: [], consumed: [] },
      startPolicy: { previewPolicy: "fidelity2", verificationPolicy: "standard", serverVerify: { run: false, reason: "design_preview_skip_verify" },
        preview: { canStartPreview, hasBuildBreakingFindings }, postChecks: { willRunQualityGate: true, qualityGatePlanned: true, materializeImages: false } },
    } };
  }
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); state.rows = []; state.receipts = []; state.conditions = []; state.latestOrders = [];
    state.owner = "u"; state.session = "s"; state.billing = true; state.imported = false; state.pageSize = 64; });
  afterEach(() => vi.restoreAllMocks());

  it("two policy-STOP candidates ahead of a runnable THIRD do not fill/starve the batch", async () => {
    const [a, b, c] = [version("v_a"), version("v_b"), version("v_c")];
    state.rows = [a, b, c]; state.receipts = [init(a, false), init(b, true, true), init(c)];
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([{ chatId: "v_c", versionId: "v_c" }]);
    expect(state.latestOrders).toHaveLength(3);
    expect(state.conditions.some(sql => sql.includes('"latest_postcheck_version"') && sql.includes("engine_version_jobs") && sql.includes("clock_timestamp"))).toBe(true);
  });
  it("latest version_number FIRST prevents an older pending row hiding behind a newer failed head", async () => {
    const old = version("v_a", "c", 1); const head = { ...version("v_b", "c", 2), verificationState: "failed" };
    state.rows = [old, head]; state.receipts = [init(old)];
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([]);
    expect((await getServerPostcheckTarget("c", "v_a"))?.latest).toBe(false);
  });
  it("stale verifying/repairing can be selected without an active lease; saved user repair is never selected", async () => {
    const a = { ...version("v_a"), verificationState: "verifying" };
    const b = { ...version("v_b"), verificationState: "repairing" };
    const c = { ...version("v_c"), verificationState: "repairing", repairedFilesJson: "candidate" };
    state.rows = [a, b, c]; state.receipts = [init(a), init(b), init(c)];
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([{ chatId: "v_a", versionId: "v_a" }, { chatId: "v_b", versionId: "v_b" }]);
    expect(state.conditions.some(sql => sql.includes("lease_expires_at") && sql.includes('"repaired_files_json" is null'))).toBe(true);
  });
  it("keyset continues past unknown, terminal and not-due pages, then caps selection at TWO", async () => {
    const rows = ["v_a", "v_b", "v_c", "v_d", "v_e", "v_f"].map(id => version(id));
    state.rows = rows; state.pageSize = 2;
    state.receipts = rows.slice(1).map(row => init(row));
    for (const [index, terminal, nextEligibleAt] of [[1, "completed", NOW - 1000], [2, null, NOW + 10_000]] as const) {
      const row = rows[index]; state.receipts.push({ id: receiptId(row.id, "resume_control"), category: "server-repair:budget", versionId: row.id,
        meta: { kind: "resume_control", schema: 1, chatId: row.chatId, versionId: row.id, scopeId: row.id + ":original",
          authority: "generated_postchecks_resume", originalCreatedAt: row.createdAt.getTime(), attempts: [], boundedHolds: 0, nextEligibleAt, terminal } });
    }
    expect(await listServerPostcheckCandidates(10, NOW + 1000)).toEqual([{ chatId: "v_d", versionId: "v_d" }, { chatId: "v_e", versionId: "v_e" }]);
  });
  it.each(["user", "stored_guest", "session_guest"])("identity comes from persisted app_projects (%s), not a fake request", async kind => {
    state.rows = [version("v_a", "c")];
    if (kind === "stored_guest") state.owner = "guest:s";
    if (kind === "session_guest") state.owner = null;
    expect(await getServerPostcheckTarget("c", "v_a")).toMatchObject({ chat: { id: "c", project_id: "app-project" },
      userId: kind === "user" ? "u" : "guest:s", sessionId: "s", hasBilling: true });
    expect(state.conditions.at(-1)).toContain('"engine_versions"."chat_id"');
  });
  it("missing persisted identity or generated billing does not become an invented guest/grant", async () => {
    const row = version("v_a", "c"); state.rows = [row]; state.receipts = [init(row)]; state.owner = null; state.session = null;
    expect(await getServerPostcheckTarget("c", "v_a")).toBeNull();
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([]);
    state.owner = "u"; state.billing = false;
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([]);
  });
  it("import lineage selects nonpaid control at 90s without manufacturing a generated init", async () => {
    state.imported = true; state.billing = false;
    state.rows = [{ ...version("v_a", "c"), createdAt: new Date(NOW - 90_000), editKind: "imported_repo" }];
    expect(await listServerPostcheckCandidates(2, NOW + 1000)).toEqual([{ chatId: "c", versionId: "v_a" }]);
    expect(state.receipts).toEqual([]);
  });
});
