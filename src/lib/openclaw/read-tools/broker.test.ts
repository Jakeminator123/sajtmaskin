import { describe, expect, it, vi } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { createOpenClawReadToolSession } from "./broker";
import type { OpenClawReadTarget, OpenClawReadToolDataSource } from "./source";

const request = new Request("https://sajtmaskin.test/api/openclaw");

function makeTarget(overrides?: {
  chatId?: string;
  versionId?: string;
  filesRevision?: string;
  files?: CodeFile[];
}): OpenClawReadTarget {
  return {
    chatId: overrides?.chatId ?? "chat-owned",
    files: overrides?.files ?? [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: "export default function Page() { return <main>safe needle</main>; }",
      },
    ],
    metadata: {
      versionId: overrides?.versionId ?? "version-1",
      versionNumber: 1,
      filesRevision: overrides?.filesRevision ?? "revision-1",
      lifecycleStage: "design",
      releaseState: "draft",
      verificationState: "pending",
      verificationSummary: null,
      editKind: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      hasPreviewUrl: false,
    },
  };
}

function makeDataSource(target = makeTarget()): OpenClawReadToolDataSource {
  return {
    loadTarget: vi.fn(async () => ({ ok: true as const, target })),
    loadDiagnostics: vi.fn(async () => []),
    loadPreviewStatus: vi.fn(async () => ({
      status: "missing" as const,
      source: "session_store" as const,
      sessionVersionMatches: null,
      sessionRevisionMatches: null,
      hostVersionMatches: null,
      hostRevisionMatches: null,
      expiresAt: null,
      readiness: "not_available_without_side_effects" as const,
    })),
    loadPreviewLogs: vi.fn(async () => ({
      available: false,
      reason: "no_session" as const,
      lines: [],
      truncated: false,
    })),
  };
}

async function createSession(
  dataSource: OpenClawReadToolDataSource,
  options?: Parameters<typeof createOpenClawReadToolSession>[1],
) {
  return createOpenClawReadToolSession(
    { request, chatId: "chat-owned", versionId: "version-1", sessionId: "auth-session" },
    { ...options, dataSource },
  );
}

describe("OpenClaw read-tool broker security", () => {
  it("fails closed when tenant-scoped ownership or chat/version binding is unavailable", async () => {
    const unavailable = makeDataSource();
    vi.mocked(unavailable.loadTarget).mockResolvedValue({
      ok: false,
      code: "target_unavailable",
    });
    const denied = await createSession(unavailable);
    expect(denied).toEqual({
      ok: false,
      error: {
        code: "target_unavailable",
        message: "The bound project target is unavailable.",
      },
    });
    expect(unavailable.loadDiagnostics).not.toHaveBeenCalled();
    expect(unavailable.loadPreviewStatus).not.toHaveBeenCalled();
    expect(unavailable.loadPreviewLogs).not.toHaveBeenCalled();

    const mismatched = makeDataSource(makeTarget({ chatId: "other-tenant-chat" }));
    const mismatchResult = await createSession(mismatched);
    expect(mismatchResult.ok).toBe(false);
    if (!mismatchResult.ok) expect(mismatchResult.error.code).toBe("snapshot_invalid");
  });

  it("binds the receipt to the exact server-owned version and revision", async () => {
    const result = await createSession(makeDataSource());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt).toMatchObject({
      versionId: "version-1",
      filesRevision: "revision-1",
    });
    const response = await result.session.execute({
      name: "project_get_version",
      arguments: {},
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.receipt).toEqual(result.receipt);
      expect(response.data).not.toHaveProperty("chatId");
      expect(response.data).not.toHaveProperty("previewUrl");
    }
  });

  it("rejects oversized file metadata even from an injected server source", async () => {
    const result = await createSession(
      makeDataSource(
        makeTarget({
          files: [{ path: "app/page.tsx", content: "safe", language: "x".repeat(41) }],
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("project_too_large");
  });

  it("rejects stale revisions before dispatch", async () => {
    const dataSource = makeDataSource();
    const created = await createSession(dataSource);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    vi.mocked(dataSource.loadTarget).mockResolvedValue({
      ok: true,
      target: makeTarget({ filesRevision: "revision-2" }),
    });
    const response = await created.session.execute({ name: "preview_get_logs", arguments: {} });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("stale_revision");
    expect(dataSource.loadPreviewLogs).not.toHaveBeenCalled();
  });

  it("discards an in-flight result if the revision changes after dispatch", async () => {
    const original = makeTarget();
    const dataSource = makeDataSource(original);
    vi.mocked(dataSource.loadTarget)
      .mockResolvedValueOnce({ ok: true, target: original })
      .mockResolvedValueOnce({ ok: true, target: original })
      .mockResolvedValueOnce({
        ok: true,
        target: makeTarget({ filesRevision: "revision-raced" }),
      });
    vi.mocked(dataSource.loadDiagnostics).mockResolvedValue([
      {
        level: "error",
        category: "build",
        message: "must not escape",
        createdAt: "2026-08-24T00:00:00.000Z",
        defect: null,
      },
    ]);

    const created = await createSession(dataSource);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const response = await created.session.execute({
      name: "project_get_diagnostics",
      arguments: {},
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("stale_revision");
  });

  it("expires scopes and exhausts call and output budgets", async () => {
    let now = 10_000;
    const expired = await createSession(makeDataSource(), {
      now: () => now,
      ttlMs: 10,
    });
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    now = 10_010;
    const expiredResponse = await expired.session.execute({
      name: "project_get_version",
      arguments: {},
    });
    expect(expiredResponse.ok).toBe(false);
    if (!expiredResponse.ok) expect(expiredResponse.error.code).toBe("scope_expired");

    const oneCall = await createSession(makeDataSource(), {
      budget: {
        maxCalls: 1,
        maxOutputChars: 80_000,
        maxSearchMatches: 80,
        maxListedFiles: 400,
      },
    });
    expect(oneCall.ok).toBe(true);
    if (!oneCall.ok) return;
    expect((await oneCall.session.execute({ name: "project_get_version", arguments: {} })).ok).toBe(
      true,
    );
    const second = await oneCall.session.execute({
      name: "project_get_version",
      arguments: {},
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("budget_exhausted");

    const tinyOutput = await createSession(makeDataSource(), {
      budget: {
        maxCalls: 2,
        maxOutputChars: 1,
        maxSearchMatches: 80,
        maxListedFiles: 400,
      },
    });
    expect(tinyOutput.ok).toBe(true);
    if (!tinyOutput.ok) return;
    const outputResponse = await tinyOutput.session.execute({
      name: "project_get_version",
      arguments: {},
    });
    expect(outputResponse.ok).toBe(false);
    if (!outputResponse.ok) expect(outputResponse.error.code).toBe("budget_exhausted");
  });

  it("discards results when the scope expires during dispatch or post-read validation", async () => {
    let dispatchNow = 1_000;
    const dispatchSource = makeDataSource();
    vi.mocked(dispatchSource.loadDiagnostics).mockImplementation(async () => {
      dispatchNow = 1_010;
      return [];
    });
    const dispatchSession = await createSession(dispatchSource, {
      now: () => dispatchNow,
      ttlMs: 10,
    });
    expect(dispatchSession.ok).toBe(true);
    if (!dispatchSession.ok) return;
    const dispatchResponse = await dispatchSession.session.execute({
      name: "project_get_diagnostics",
      arguments: {},
    });
    expect(dispatchResponse.ok).toBe(false);
    if (!dispatchResponse.ok) expect(dispatchResponse.error.code).toBe("scope_expired");

    let postNow = 2_000;
    const postSource = makeDataSource();
    vi.mocked(postSource.loadTarget).mockImplementation(async () => {
      if (vi.mocked(postSource.loadTarget).mock.calls.length >= 3) postNow = 2_010;
      return { ok: true, target: makeTarget() };
    });
    const postSession = await createSession(postSource, {
      now: () => postNow,
      ttlMs: 10,
    });
    expect(postSession.ok).toBe(true);
    if (!postSession.ok) return;
    const postResponse = await postSession.session.execute({
      name: "project_get_version",
      arguments: {},
    });
    expect(postResponse.ok).toBe(false);
    if (!postResponse.ok) expect(postResponse.error.code).toBe("scope_expired");
  });

  it("never dispatches when tenant preflight crosses the scope expiry", async () => {
    let now = 3_000;
    const dataSource = makeDataSource();
    vi.mocked(dataSource.loadTarget).mockImplementation(async () => {
      if (vi.mocked(dataSource.loadTarget).mock.calls.length >= 2) now = 3_010;
      return { ok: true, target: makeTarget() };
    });
    const created = await createSession(dataSource, { now: () => now, ttlMs: 10 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const response = await created.session.execute({
      name: "project_get_diagnostics",
      arguments: {},
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("scope_expired");
    expect(dataSource.loadDiagnostics).not.toHaveBeenCalled();
    expect(dataSource.loadPreviewLogs).not.toHaveBeenCalled();
  });

  it("enforces separate search and file-list budgets", async () => {
    const target = makeTarget({
      files: [
        { path: "a.ts", language: "ts", content: "needle" },
        { path: "b.ts", language: "ts", content: "needle" },
      ],
    });
    const searchBudget = await createSession(makeDataSource(target), {
      budget: {
        maxCalls: 2,
        maxOutputChars: 80_000,
        maxSearchMatches: 1,
        maxListedFiles: 400,
      },
    });
    expect(searchBudget.ok).toBe(true);
    if (!searchBudget.ok) return;
    const search = await searchBudget.session.execute({
      name: "project_search_code",
      arguments: { query: "needle", limit: 2 },
    });
    expect(search.ok).toBe(false);
    if (!search.ok) expect(search.error.code).toBe("budget_exhausted");

    const listBudget = await createSession(makeDataSource(target), {
      budget: {
        maxCalls: 2,
        maxOutputChars: 80_000,
        maxSearchMatches: 80,
        maxListedFiles: 1,
      },
    });
    expect(listBudget.ok).toBe(true);
    if (!listBudget.ok) return;
    const list = await listBudget.session.execute({
      name: "project_list_files",
      arguments: { limit: 2 },
    });
    expect(list.ok).toBe(false);
    if (!list.ok) expect(list.error.code).toBe("budget_exhausted");
  });

  it("scrubs diagnostics and preview logs without exposing session identifiers or URLs", async () => {
    const dataSource = makeDataSource();
    vi.mocked(dataSource.loadDiagnostics).mockResolvedValue([
      {
        level: "error",
        category: "auth",
        message: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
        createdAt: "2026-08-24T00:00:00.000Z",
        defect: null,
      },
    ]);
    vi.mocked(dataSource.loadPreviewLogs).mockResolvedValue({
      available: true,
      reason: "ok",
      lines: [
        {
          ts: "2026-08-24T00:00:00.000Z",
          message:
            "session ps-secret https://preview.internal/x?token=top-secret api_key=sk-proj-abcdefghijklmnopqrstuvwxyz",
        },
      ],
      truncated: false,
      redactValues: ["ps-secret-id", "https://preview.internal"],
    });
    const created = await createSession(dataSource);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const diagnostics = await created.session.execute({
      name: "project_get_diagnostics",
      arguments: {},
    });
    expect(JSON.stringify(diagnostics)).not.toContain("abcdefghijklmnopqrstuvwxyz");

    const logs = await created.session.execute({ name: "preview_get_logs", arguments: {} });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("sk-proj-");
    expect(serialized).not.toContain("ps-secret-id");
    expect(serialized).not.toContain("preview.internal");
    expect(serialized).not.toContain("previewSessionId");
    expect(serialized).not.toContain("previewUrl");
    expect(serialized).toContain("[REDACTED]");
  });
});
