import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const createChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const startPreviewSession = vi.hoisted(() => vi.fn());
const persistImportedRepoInitialization = vi.hoisted(() => vi.fn());
const recordImportedRepoPreviewOutcome = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  saveProjectData,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat,
  addMessage,
  createDraftVersion,
  updateVersionPreviewUrl,
  getChat,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/tenant", () => ({
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/gen/preview/preview-session", () => ({
  startPreviewSession,
}));

vi.mock("@/lib/templates/imported-repo-initialization", () => ({
  persistImportedRepoInitialization,
  recordImportedRepoPreviewOutcome,
}));

vi.mock("@/lib/models/selection", () => ({
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});

import { POST } from "./route";
import { MAX_GITHUB_TREE_SEGMENTS } from "@/lib/import/import-init-contract";

describe("POST /api/engine/chats/init", () => {
  beforeEach(() => {
    createProject.mockReset();
    saveProjectData.mockReset();
    createChat.mockReset();
    addMessage.mockReset();
    createDraftVersion.mockReset();
    updateVersionPreviewUrl.mockReset();
    getChat.mockReset();
    getCurrentUser.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    resolveAppProjectIdForRequest.mockReset();
    startPreviewSession.mockReset();
    persistImportedRepoInitialization.mockReset();
    recordImportedRepoPreviewOutcome.mockReset();
    safeFetch.mockReset();

    getCurrentUser.mockResolvedValue({
      id: "user_import",
      email: "importer@example.com",
      diamonds: 0,
      free_generation_available: true,
      github_token: null,
    });
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "https://example-preview.test/?chatId=chat_import",
        previewSessionId: "preview_import",
        previewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        runtimeReady: false,
        filesRevision: "revision_import",
        tier2Meta: { tier2Provider: "preview_host" },
      },
    });
    createProject.mockResolvedValue({ id: "proj_import" });
    createChat.mockResolvedValue({ id: "chat_import" });
    addMessage
      .mockResolvedValueOnce({ id: "msg_user" })
      .mockResolvedValueOnce({ id: "msg_assistant" });
    createDraftVersion.mockResolvedValue({
      id: "ver_import",
      files_revision: "revision_import",
    });
    getChat.mockResolvedValue({ messages: [{ id: "msg_assistant", role: "assistant" }] });
    persistImportedRepoInitialization.mockResolvedValue({
      snapshotPersisted: true,
      telemetryPersisted: true,
    });
    recordImportedRepoPreviewOutcome.mockResolvedValue(false);
  });

  it("imports ZIP content into an own-engine chat and first version", async () => {
    const zip = new JSZip();
    zip.file(
      "repo-root/src/app/page.tsx",
      "export default function Page() { return <div>Hej</div>; }",
    );
    zip.file("repo-root/package.json", '{ "name": "demo" }');
    zip.file("repo-root/pnpm-lock.yaml", "lockfileVersion: '9.0'");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            type: "zip",
            content: buffer.toString("base64"),
          },
          message: "Gor detta till en portfolio",
          lockConfigFiles: true,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      id: "chat_import",
      chatId: "chat_import",
      versionId: "ver_import",
      projectId: "proj_import",
      source: "zip",
      preview: { status: "starting", runtimeReady: false, retryable: true },
    });
    expect(json.previewUrl).toContain("chatId=chat_import");
    expect(Array.isArray(json.lockedFiles)).toBe(true);
    expect(createChat).toHaveBeenCalledWith("proj_import", "gpt-5.4");
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_assistant",
      expect.stringContaining('"path":"pnpm-lock.yaml"'),
      undefined,
      { editKind: "imported_repo" },
    );
    expect(persistImportedRepoInitialization).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_import",
        versionId: "ver_import",
        filesRevision: "revision_import",
        origin: { kind: "zip" },
        baseline: expect.objectContaining({
          versionId: "ver_import",
          filesRevision: "revision_import",
        }),
      }),
    );
    expect(persistImportedRepoInitialization.mock.invocationCallOrder[0]).toBeLessThan(
      startPreviewSession.mock.invocationCallOrder[0],
    );
    expect(startPreviewSession).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        skipRepair: true,
        skipProjectScaffold: true,
        chatId: "chat_import",
        appProjectId: "proj_import",
        versionIdForSession: "ver_import",
      }),
    );
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      filesRevision: "revision_import",
      outcome: "pending",
    });
    expect(saveProjectData).toHaveBeenCalled();
    expect(commitCredits).toHaveBeenCalled();
  });

  // A#7 (P1): yarn.lock has no recognised extension in TEXT_EXTENSIONS, so it
  // was silently dropped before the TEXT_BASENAMES fix. Without it the preview
  // host falls back to `npm install` instead of `yarn install --frozen-lockfile`.
  it("preserves yarn.lock from ZIP so the preview host selects yarn install", async () => {
    const zip = new JSZip();
    zip.file(
      "repo-root/src/app/page.tsx",
      "export default function Page() { return <div>Hi</div>; }",
    );
    zip.file("repo-root/package.json", '{ "name": "yarn-repo" }');
    zip.file("repo-root/yarn.lock", "# yarn lockfile v1\n");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "zip", content: buffer.toString("base64") },
          message: "Make this a portfolio",
          lockConfigFiles: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_assistant",
      expect.stringContaining('"path":"yarn.lock"'),
      undefined,
      { editKind: "imported_repo" },
    );
  });

  it("records an explicit failed outcome when imported preview startup fails", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo-root/package.json", '{"scripts":{"dev":"next dev"}}');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    startPreviewSession.mockResolvedValueOnce({
      ok: false,
      error: { stage: "preview-start", message: "host unavailable" },
    });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { type: "zip", content: buffer.toString("base64") } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      chatId: "chat_import",
      projectId: "proj_import",
      versionId: "ver_import",
      preview: { status: "failed", retryable: true },
    });
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      outcome: "failed",
    });
    expect(commitCredits).toHaveBeenCalled();
    expect(createChat).toHaveBeenCalledTimes(1);
  });

  it("records runtime-ready only after the preview host confirms readiness", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo-root/package.json", '{"scripts":{"dev":"next dev"}}');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    startPreviewSession.mockResolvedValueOnce({
      ok: true,
      result: {
        previewUrl: "https://example-preview.test/?chatId=chat_import",
        runtimeReady: true,
        filesRevision: "booted_revision",
      },
    });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { type: "zip", content: buffer.toString("base64") } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      preview: { status: "ready", runtimeReady: true },
    });
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      filesRevision: "booted_revision",
      outcome: "runtime-ready",
    });
  });

  it("records failure when preview startup returns no usable URL", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo-root/package.json", '{"scripts":{"dev":"next dev"}}');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    startPreviewSession.mockResolvedValueOnce({
      ok: true,
      result: { previewUrl: "   ", runtimeReady: false, filesRevision: "revision_import" },
    });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { type: "zip", content: buffer.toString("base64") } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      preview: { status: "failed", retryable: true },
    });
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      outcome: "failed",
    });
    expect(commitCredits).toHaveBeenCalled();
  });

  it("rejects a ZIP URL that points at a private/metadata host", async () => {
    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "zip", url: "http://169.254.169.254/latest/meta-data" },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "ZIP-adressen är inte tillåten.",
      code: "zip_url_blocked",
    });
    expect(safeFetch).not.toHaveBeenCalled();
    expect(createChat).not.toHaveBeenCalled();
  });

  it.each([
    [401, "Nedladdningen av arkivet nekades.", "zip_unauthorized"],
    [403, "Nedladdningen av arkivet är förbjuden.", "zip_forbidden"],
    [404, "Arkivet hittades inte.", "zip_not_found"],
    [429, "Nedladdningen begränsas just nu. Försök igen om en stund.", "zip_rate_limited"],
  ] as const)("propagates upstream ZIP HTTP %s without calling it SSRF", async (status, error, code) => {
    safeFetch.mockResolvedValueOnce(new Response("rate limit or token problem", { status }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "zip", url: "https://example.com/repo.zip" },
        }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body).toMatchObject({ error, code, step: "download" });
    expect(JSON.stringify(body).toLowerCase()).not.toContain("bearer");
    expect(createChat).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/repo.zip",
      expect.objectContaining({ maxBodyBytes: 50 * 1024 * 1024 }),
    );
  });

  it("imports a public GitHub repo root using a verified commit SHA", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return <div>Hej</div>; }");
    zip.file("repo-root/package.json", '{ "name": "demo" }');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    safeFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ private: false, default_branch: "main" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc1234def" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(buffer), { status: 200 }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "github", url: "https://github.com/acme/site.git" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      projectId: "proj_import",
      chatId: "chat_import",
      source: "github",
    });
    expect(safeFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Sajtmaskin-Import") }),
      }),
    );
    expect(safeFetch.mock.calls[2]?.[0]).toBe("https://github.com/acme/site/archive/abc1234def.zip");
    expect(createProject).toHaveBeenCalled();
  });

  it("uses the authenticated zipball for a private repo", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    getCurrentUser.mockResolvedValueOnce({
      id: "user_import",
      email: "importer@example.com",
      diamonds: 0,
      free_generation_available: true,
      github_token: "user-token",
    });
    safeFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ private: true, default_branch: "main" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "fff111" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(buffer), { status: 200 }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "github", url: "https://github.com/acme/private-site" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const zipCall = safeFetch.mock.calls[2];
    expect(zipCall?.[0]).toBe("https://api.github.com/repos/acme/private-site/zipball/fff111");
    expect(zipCall?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
          "User-Agent": expect.stringContaining("Sajtmaskin-Import"),
        }),
      }),
    );
  });

  it("rejects a long /tree/a/b/c/... GitHub URL before any GitHub request", async () => {
    const segments = Array.from({ length: MAX_GITHUB_TREE_SEGMENTS + 1 }, (_, index) => `s${index}`);
    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            type: "github",
            url: `https://github.com/acme/site/tree/${segments.join("/")}`,
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "github_url_invalid",
      step: "parse",
    });
    expect(safeFetch).not.toHaveBeenCalled();
    expect(createChat).not.toHaveBeenCalled();
  });

  it("imports a public GitHub repo after a stale saved token fails metadata auth", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return <div>Hej</div>; }");
    zip.file("repo-root/package.json", '{ "name": "demo" }');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    getCurrentUser.mockResolvedValueOnce({
      id: "user_import",
      email: "importer@example.com",
      diamonds: 0,
      free_generation_available: true,
      github_token: "stale-token",
    });
    safeFetch
      .mockResolvedValueOnce(new Response("bad credentials", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ private: false, default_branch: "main" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc1234def" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(buffer), { status: 200 }));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "github", url: "https://github.com/acme/site" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      projectId: "proj_import",
      chatId: "chat_import",
    });
    expect(safeFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer stale-token" }),
      }),
    );
    expect(safeFetch.mock.calls[3]?.[0]).toBe("https://github.com/acme/site/archive/abc1234def.zip");
    expect(safeFetch.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it("returns the saved import when startPreviewSession throws", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo-root/package.json", '{"scripts":{"dev":"next dev"}}');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    startPreviewSession.mockRejectedValueOnce(new Error("preview host exploded"));

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { type: "zip", content: buffer.toString("base64") } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      chatId: "chat_import",
      projectId: "proj_import",
      versionId: "ver_import",
      preview: { status: "failed", retryable: true },
    });
    expect(commitCredits).toHaveBeenCalled();
    expect(createChat).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["recordImportedRepoPreviewOutcome", () => recordImportedRepoPreviewOutcome.mockRejectedValueOnce(new Error("outcome write failed"))],
    ["updateVersionPreviewUrl", () => updateVersionPreviewUrl.mockRejectedValueOnce(new Error("preview url write failed"))],
    ["saveProjectData", () => {
      saveProjectData.mockResolvedValueOnce(undefined);
      saveProjectData.mockRejectedValueOnce(new Error("preview project save failed"));
    }],
  ] as const)("returns the saved import when %s throws after persist", async (_name, arrange) => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo-root/package.json", '{"scripts":{"dev":"next dev"}}');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    arrange();

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { type: "zip", content: buffer.toString("base64") } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      chatId: "chat_import",
      projectId: "proj_import",
      versionId: "ver_import",
      preview: { status: "failed", retryable: true },
    });
    expect(commitCredits).toHaveBeenCalled();
  });
});
