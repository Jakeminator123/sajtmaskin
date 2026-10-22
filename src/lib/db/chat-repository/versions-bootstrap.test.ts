import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ServerFinalizeBootstrap } from "../services/server-repair-budget";

const state = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  versions: [] as Record<string, unknown>[],
  receipts: [] as Record<string, unknown>[],
  order: [] as string[],
  revision: "db-generated-revision" as string | null,
  wrongChat: false,
  wrongId: false,
  storedEditKind: null as string | null,
  failReceipt: false,
  conflictReceipt: false,
}));
const eligible = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/gen/verify/server-verify", () => ({ isServerVerifyEligible: eligible }));
vi.mock("../services/version-errors", () => ({ SERVER_REPAIR_BUDGET_LOG_CATEGORY: "server-repair:budget" }));
vi.mock("./version-lifecycle", () => ({ promoteVersion: vi.fn() }));
vi.mock("../client", () => ({
  dbConfigured: true,
  db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const snapshot = { messages: [...state.messages], versions: [...state.versions], receipts: [...state.receipts] };
    const tx = {
      insert: (table: Table) => ({ values: (row: Record<string, unknown>) => {
        if (getTableName(table) === "engine_messages") {
          state.messages.push(row); state.order.push("message");
          return Promise.resolve();
        }
        return { onConflictDoNothing: () => ({ returning: async () => {
          state.order.push("receipt");
          if (state.failReceipt) throw new Error("receipt unavailable");
          if (state.conflictReceipt) return [];
          state.receipts.push(row);
          return [{ id: row.id }];
        } }) };
      } }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
      execute: async (statement: SQL) => {
        const query = new PgDialect().sqlToQuery(statement);
        expect(query.sql).toContain("INSERT INTO engine_versions");
        // Revision must come from DB readback, never INSERT or caller metadata.
        expect(query.sql).not.toContain("files_revision");
        state.versions.push({ id: state.wrongId ? " " : query.params[0],
          chatId: state.wrongChat ? "other-chat" : query.params[1],
          filesRevision: state.revision, editKind: state.storedEditKind ?? query.params.at(-2) });
        state.order.push("version");
        return [];
      },
      select: () => ({ from: (table: Table) => ({ where: () => ({ limit: async () =>
        getTableName(table) === "engine_versions" ? state.versions.slice(-1) : state.messages.slice(-1),
      }) }) }),
    };
    try { const result = await fn(tx); state.order.push("commit"); return result; }
    catch (error) { Object.assign(state, snapshot); state.order.push("rollback"); throw error; }
  } },
}));

import { addAssistantMessageAndCreateDraftVersion } from "./versions";

function bootstrap(): ServerFinalizeBootstrap {
  return {
    source: "trusted_new_finalize", scopeId: "original:root", finalize: [],
    buildSpec: { buildIntent: "website", generationMode: "init", changeScope: "redesign",
      scaffoldId: null, routePlanSummary: "", stylePack: "clean", qualityTarget: "standard",
      previewPolicy: "fidelity2", verificationPolicy: "standard", contextPolicy: "normal",
      referenceCategories: [], forbiddenPatterns: [],
      tokenBudgets: { scaffoldChars: 0, refsChars: 0, systemContextChars: 0 } },
    verifierGatesVerification: false, previewHasBuildBreakingFindings: false,
    willRunQualityGate: true, qualityGatePlanned: true,
    materializeImages: false,
    preflight: { preflightIssues: [], preflightFileCount: 1, finalizedPreviewFileCount: 1,
      previewBlockingReason: null, scaffoldRetry: null, routePlan: null, scaffoldSelection: null,
      previewStart: { canStartPreview: true, primaryPreviewTarget: "preview", shimBlocked: false,
        requiresEnvConfig: false, hasCriticalInstallRisk: false, hasCriticalCodeFailure: false,
        compatibilityPreviewAllowed: false, blockingCategories: [],
        issueCounts: { code_structure_failure: 0, dependency_install_failure: 0, env_config_missing: 0,
          shim_preview_failure: 0, non_blocking_quality_warning: 0 } } },
  };
}
const create = (input = bootstrap(), editKind?: string) => addAssistantMessageAndCreateDraftVersion(
  "chat", "assistant", "[]", { finalizeBootstrap: input, editKind,
    lifecycleStage: input.buildSpec.previewPolicy === "fidelity3" ? "integrations" : "design",
    parentVersionId: input.buildSpec.previewPolicy === "fidelity3" ? "parent-f2" : null },
);
const metadata = () => state.receipts[0].meta as Record<string, unknown>;

beforeEach(() => {
  state.messages = []; state.versions = []; state.receipts = []; state.order = [];
  state.revision = "db-generated-revision"; state.wrongChat = false; state.wrongId = false;
  state.storedEditKind = null; state.failReceipt = false; state.conflictReceipt = false;
  eligible.mockClear().mockReturnValue(true);
});

describe("atomic trusted new finalize bootstrap", () => {
  it.each([true, false, undefined])("persists typed materializeImages %s in the existing atomic start receipt", async (choice) => {
    await create({ ...bootstrap(), materializeImages: choice });
    expect(metadata().startPolicy).toMatchObject({ postChecks: { materializeImages: choice === true } });
    expect(state.order).toEqual(["message", "version", "receipt", "commit"]);
    expect(state.receipts).toHaveLength(1);
  });

  it.each(["imported_repo", "quick_edit", "restore"])("image choice never permits %s to bootstrap paid authority", async (editKind) => {
    await expect(create({ ...bootstrap(), materializeImages: true }, editKind)).rejects.toThrow("Only normal finalize");
    expect(state.receipts).toEqual([]);
    expect(state.messages).toEqual([]);
  });
  it("commits message/version/start together with actual DB identity, without lease or model reservation", async () => {
    const result = await create();
    expect(state.order).toEqual(["message", "version", "receipt", "commit"]);
    expect(metadata()).toMatchObject({ chatId: "chat", versionId: result.version.id,
      filesRevision: "db-generated-revision", scopeId: "original:root",
      history: { source: "observed_fixer_calls", finalize: [], consumed: [] } });
    expect(state.receipts).toHaveLength(1);
    expect(eligible).toHaveBeenCalledWith(result.version.id);
  });

  it.each(["write", "conflict"])("rolls back assistant/version on receipt %s failure", async (failure) => {
    state.failReceipt = failure === "write"; state.conflictReceipt = failure === "conflict";
    await expect(create()).rejects.toThrow(failure === "write" ? "receipt unavailable" : "not stored");
    expect(state.messages).toEqual([]); expect(state.versions).toEqual([]); expect(state.receipts).toEqual([]);
    expect(state.order.at(-1)).toBe("rollback");
  });

  it.each(["chat", "id", "revision", "provenance"])("rolls back invalid DB %s", async (invalid) => {
    state.wrongChat = invalid === "chat"; state.wrongId = invalid === "id";
    if (invalid === "revision") state.revision = null;
    if (invalid === "provenance") state.storedEditKind = "quick_edit";
    await expect(create()).rejects.toThrow("bootstrap identity/history");
    expect(state.messages).toEqual([]); expect(state.versions).toEqual([]); expect(state.receipts).toEqual([]);
  });

  it("rejects explicit quick-edit bootstrap and untrusted source", async () => {
    await expect(create(bootstrap(), "quick_edit")).rejects.toThrow("Only normal finalize");
    const input = bootstrap(); Object.assign(input, { source: "manual" });
    await expect(create(input)).rejects.toThrow("bootstrap identity/history");
    expect(state.receipts).toEqual([]); expect(state.messages).toEqual([]);
  });

  it.each([undefined, "quick_edit"])("does not bootstrap a generic/manual writer (%s)", async (editKind) => {
    await addAssistantMessageAndCreateDraftVersion("chat", "manual", "[]", { editKind });
    expect(state.order).toEqual(["message", "version", "commit"]);
    expect(state.receipts).toEqual([]); expect(eligible).not.toHaveBeenCalled();
  });

  it("keeps normal F2 post-check and preview intent despite server-verify skip", async () => {
    await create();
    expect(metadata().startPolicy).toMatchObject({ previewPolicy: "fidelity2",
      serverVerify: { run: false, reason: "design_preview_skip_verify" },
      postChecks: { willRunQualityGate: true, qualityGatePlanned: true },
      preview: { canStartPreview: true, hasBuildBreakingFindings: false } });
  });

  it.each(["f3", "fast", "blocked", "diagnostic", "not_eligible"])("reuses existing policy for %s with actual version id", async (mode) => {
    const input = bootstrap();
    if (mode === "f3") input.buildSpec.previewPolicy = "fidelity3";
    if (mode === "fast") input.buildSpec.verificationPolicy = "fast";
    if (mode === "diagnostic") input.verifierGatesVerification = true;
    if (mode === "not_eligible") eligible.mockReturnValue(false);
    if (mode === "blocked") {
      input.preflight.previewStart.canStartPreview = false;
      input.preflight.previewStart.primaryPreviewTarget = "none";
      input.preflight.previewStart.blockingCategories = ["code_structure_failure"];
    }
    const result = await create(input);
    const reason = { f3: "policy_match", fast: "fast_policy", blocked: "preview_blocked",
      diagnostic: "diagnostic_only_verification_blocked", not_eligible: "not_eligible" }[mode];
    expect(metadata().startPolicy).toMatchObject({ serverVerify: {
      run: mode === "f3" || mode === "diagnostic", reason,
      ...(mode === "diagnostic" ? { diagnosticOnly: true } : {}),
    } });
    if (mode !== "fast") expect(eligible).toHaveBeenCalledWith(result.version.id);
  });
});
