import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditBuildHandoff } from "./audit-handoff-client";
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
  it("starts a new intent for a different analysis", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => success());
    await createAuditBuildHandoff(payload, "website");
    await createAuditBuildHandoff({ ...payload, company: "Different AB" }, "website");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).auditBuildAttemptId).not.toBe(
      JSON.parse(fetchMock.mock.calls[1][1]?.body as string).auditBuildAttemptId,
    );
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
