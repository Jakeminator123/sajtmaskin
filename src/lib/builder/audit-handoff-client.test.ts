import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditBuildHandoff } from "./audit-handoff-client";
const auth = vi.hoisted(() => ({ user: { id: "user_1" } as { id: string } | null }));
vi.mock("@/lib/auth/auth-store", () => ({ useAuthStore: { getState: () => auth } }));
const payload = {
  domain: "example.se",
  url: "https://example.se",
  company: "Example AB",
  audit_scores: { seo: 70 },
};
const success = () =>
  new Response(JSON.stringify({ success: true, projectId: "project_1", promptId: "prompt_1" }));

describe("createAuditBuildHandoff", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    auth.user = { id: "user_1" };
    localStorage.clear();
    sessionStorage.clear();
    const pending = new Map<string, Promise<unknown>>();
    vi.stubGlobal("navigator", {
      locks: {
        request: vi.fn((key: string, _options: unknown, run: () => string) => {
          const result = (pending.get(key) ?? Promise.resolve()).then(run);
          pending.set(
            key,
            result.catch(() => undefined),
          );
          return result;
        }),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("requests one atomic operation and returns the existing builder href", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(success());
    const result = await createAuditBuildHandoff(payload, "website");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      prompt: "Bygg en förbättrad sajt för example.se",
      source: "audit",
      auditBuildAttemptId: expect.any(String),
      auditBuildOwnerId: "user_1",
      payload,
    });
    expect(body.projectId).toBeUndefined();
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith("sajtmaskin:audit-build-attempt:v1:"),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("example.se");
    expect(localStorage.getItem(keys[0])).toBe(body.auditBuildAttemptId);
    expect(result).toEqual({
      projectId: "project_1",
      promptId: "prompt_1",
      href: "/builder?project=project_1&source=audit&promptId=prompt_1&buildMethod=audit&buildIntent=website",
    });
  });
  it.each(["network", "500", "malformed"])(
    "retains the same attempt across a %s failure and module reload",
    async (failure) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("network lost"));
      else
        fetchMock.mockResolvedValueOnce(
          new Response(failure === "500" ? '{"error":"failed"}' : "not json", {
            status: failure === "500" ? 500 : 200,
          }),
        );
      await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow();
      vi.resetModules();
      const fresh = await import("./audit-handoff-client");
      fetchMock.mockResolvedValueOnce(success());
      await fresh.createAuditBuildHandoff(payload, "website");
      const attempts = fetchMock.mock.calls.map(
        (call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId,
      );
      expect(attempts[0]).toBe(attempts[1]);
      expect(fetchMock.mock.calls.every((call) => call[0] === "/api/prompts")).toBe(true);
    },
  );
  it("keeps audit context when a consumed prompt must be hydrated after a lost response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          projectId: "project_1",
          promptId: "prompt_1",
          consumed: true,
        }),
      ),
    );
    expect((await createAuditBuildHandoff(payload, "website")).href).toContain("promptId=prompt_1");
  });
  it("keeps one attempt after a successful ACK so navigation failure cannot allocate a second project", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await createAuditBuildHandoff(payload, "website");
    await createAuditBuildHandoff(payload, "website");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId).toBe(
      JSON.parse(fetchMock.mock.calls[1][1]?.body as string).auditBuildAttemptId,
    );
  });
  it("rotates a confirmed missing-project attempt once, retaining the replacement on lost ACK", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(success());
    await createAuditBuildHandoff(payload, "website");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUDIT_HANDOFF_PROJECT_MISSING", error: "deleted" }), { status: 409 }));
    fetchMock.mockRejectedValueOnce(new Error("replacement ACK lost"));
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow("replacement ACK lost");
    fetchMock.mockResolvedValueOnce(success());
    await createAuditBuildHandoff(payload, "website");
    const ids = fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
    expect(ids[3]).toBe(ids[2]);
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === "POST")).toBe(true);
  });
  it("coalesces simultaneous missing-project responses into one replacement identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(success());
    await createAuditBuildHandoff(payload, "website");
    const staleId = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId;
    fetchMock.mockImplementation(async (_url, init) => JSON.parse(init?.body as string).auditBuildAttemptId === staleId
      ? new Response(JSON.stringify({ code: "AUDIT_HANDOFF_PROJECT_MISSING" }), { status: 409 }) : success());
    await Promise.all([createAuditBuildHandoff(payload, "website"), createAuditBuildHandoff(payload, "website")]);
    const ids = fetchMock.mock.calls.slice(1).map((call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId).filter((id) => id !== staleId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });
  it("never rotates on an untyped conflict or loops on repeated missing-project replies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response('{"error":"payload conflict"}', { status: 409 }));
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow("payload conflict");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => new Response('{"code":"AUDIT_HANDOFF_PROJECT_MISSING","error":"deleted"}', { status: 409 }));
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow("deleted");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("starts a new intent for a different analysis", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await createAuditBuildHandoff(payload, "website");
    await createAuditBuildHandoff({ ...payload, company: "Different AB" }, "website");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId).not.toBe(
      JSON.parse(fetchMock.mock.calls[1][1]?.body as string).auditBuildAttemptId,
    );
  });
  it("isolates retry rotation across accounts sharing the same analysis/browser", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await createAuditBuildHandoff(payload, "website");
    const original = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId;
    auth.user = { id: "user_2" };
    await createAuditBuildHandoff(payload, "website");
    fetchMock.mockResolvedValueOnce(new Response('{"code":"AUDIT_HANDOFF_PROJECT_MISSING"}', { status: 409 }));
    await createAuditBuildHandoff(payload, "website");
    auth.user = { id: "user_1" };
    await createAuditBuildHandoff(payload, "website");
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string).auditBuildAttemptId).toBe(original);
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).auditBuildAttemptId).not.toBe(original);
  });
  it("keeps A's retry identity while another tab starts analysis B", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("A committed but ACK lost"))
      .mockImplementation(async () => success());
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow();
    await createAuditBuildHandoff({ ...payload, company: "Analysis B" }, "website");
    vi.resetModules();
    await (await import("./audit-handoff-client")).createAuditBuildHandoff(payload, "website");
    const attempts = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId,
    );
    expect(attempts[0]).toBe(attempts[2]);
    expect(attempts[1]).not.toBe(attempts[0]);
  });
  it("serializes concurrent first attempts for the same payload before the network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await Promise.all([
      createAuditBuildHandoff(payload, "website"),
      createAuditBuildHandoff(payload, "website"),
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId).toBe(
      JSON.parse(fetchMock.mock.calls[1][1]?.body as string).auditBuildAttemptId,
    );
    expect(navigator.locks.request).toHaveBeenCalledTimes(2);
  });
  it("reuses a lost-ACK attempt after reload when equivalent nested object keys are reordered", async () => {
    const original = { ...payload, audit_scores: { seo: 70, ux: 80 }, improvements: [{ item: "Fix", impact: "high" as const }] };
    const reordered = { improvements: [{ impact: "high" as const, item: "Fix" }], audit_scores: { ux: 80, seo: 70 }, company: payload.company, url: payload.url, domain: payload.domain };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ACK lost")).mockImplementation(async () => success());
    await expect(createAuditBuildHandoff(original, "website")).rejects.toThrow("ACK lost");
    vi.resetModules();
    await (await import("./audit-handoff-client")).createAuditBuildHandoff(reordered, "website");
    const ids = fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId);
    expect(ids[1]).toBe(ids[0]);
    expect(Object.keys(localStorage)).toHaveLength(1);
  });
  it("coalesces reordered payloads across tabs but preserves array order as distinct identity", async () => {
    const first = { ...payload, audit_scores: { seo: 70, ux: 80 }, issues: ["A", "B"] };
    const reordered = { issues: ["A", "B"], audit_scores: { ux: 80, seo: 70 }, company: payload.company, domain: payload.domain, url: payload.url };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await Promise.all([createAuditBuildHandoff(first, "website"), createAuditBuildHandoff(reordered, "website")]);
    await createAuditBuildHandoff({ ...first, issues: ["B", "A"] }, "website");
    const ids = fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body as string).auditBuildAttemptId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });
  it("fails before the network request when cross-tab locking is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow("webbläsare");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails before any server write if retry identity cannot be persisted", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow("byggförsöket");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
