import { afterEach, describe, expect, it, vi } from "vitest";

const updatePreviewHostSession = vi.hoisted(() => vi.fn());
const startPreviewHostSession = vi.hoisted(() => vi.fn());
const destroyPreviewHostSession = vi.hoisted(() => vi.fn());
const buildCompleteProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data/redis", () => ({
  getRedis: () => null,
}));

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  destroyPreviewHostSession,
  startPreviewHostSession,
  updatePreviewHostSession,
}));

vi.mock("../export/project-scaffold", () => ({
  PLACEHOLDER_API_ROUTE: "export async function GET(){ return new Response('ok'); }",
  buildCompleteProject,
}));

vi.mock("../export/project-scaffold-ui-reader", () => ({
  collectRequiredUiComponents: vi.fn(() => []),
}));

vi.mock("../autofix/repair-generated-files", () => ({
  repairGeneratedFiles: vi.fn((files) => ({ files })),
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({
    STRIPE_SECRET_KEY: "sk_from_project",
  })),
}));

import { resetPreviewSessionStoreForTests, touchPreviewSessionAsync } from "./session-store";
import { startPreviewSession } from "./preview-session";

afterEach(() => {
  vi.restoreAllMocks();
  resetPreviewSessionStoreForTests();
  delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  updatePreviewHostSession.mockReset();
  startPreviewHostSession.mockReset();
  destroyPreviewHostSession.mockReset();
  buildCompleteProject.mockReset();
});

describe("startPreviewSession update path", () => {
  it("regenerates .env.local when reusing an older preview-host session", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-1",
      startOutcome: "recreated",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-1",
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-1",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
        {
          path: ".env.local",
          content: "MODEL_KEY=from_model\nSTRIPE_SECRET_KEY=sk_from_model",
          language: "text",
        },
      ],
      {
        appProjectId: "proj-1",
        chatId: "chat-1",
        versionIdForSession: "version-new",
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.startOutcome).toBe("recreated");
    }
    expect(updatePreviewHostSession).toHaveBeenCalledOnce();
    expect(startPreviewHostSession).not.toHaveBeenCalled();

    const filesJson = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as
      | Record<string, string>
      | undefined;
    expect(filesJson?.[".env.local"]).toContain("MODEL_KEY=from_model");
    expect(filesJson?.[".env.local"]).toContain("STRIPE_SECRET_KEY=sk_from_model");
    expect(filesJson?.[".env.local"]).toContain("NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=proj-1");
  });

  it("regenerates .env.local after project scaffolding on the update path", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    buildCompleteProject.mockReturnValueOnce([
      {
        path: "app/page.tsx",
        content: "export default function Page(){return <main/>;}",
        language: "typescript",
      },
      {
        path: ".env.local",
        content: "SCAFFOLD_ENV=from_scaffold",
        language: "text",
      },
    ]);
    updatePreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-2",
      startOutcome: "resumed",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-2",
      previewSessionId: "ps-existing",
      previewUrl: "https://preview-host.example.com/chat-2",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
      ],
      {
        appProjectId: "proj-2",
        chatId: "chat-2",
        versionIdForSession: "version-new",
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(buildCompleteProject).toHaveBeenCalledOnce();
    const filesJson = updatePreviewHostSession.mock.calls[0]?.[0]?.filesJson as
      | Record<string, string>
      | undefined;
    expect(filesJson?.[".env.local"]).toContain("SCAFFOLD_ENV=from_scaffold");
    expect(filesJson?.[".env.local"]).toContain("NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=proj-2");
  });

  it("forceRestart destroys the prior preview-host session before starting fresh", async () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    destroyPreviewHostSession.mockResolvedValueOnce({ ok: true, destroyed: true });
    startPreviewHostSession.mockResolvedValueOnce({
      ok: true,
      previewSessionId: "ps-new",
      previewUrl: "https://preview-host.example.com/chat-3",
      startOutcome: "recreated",
    });

    await touchPreviewSessionAsync({
      chatId: "chat-3",
      previewSessionId: "ps-old",
      previewUrl: "https://preview-host.example.com/chat-3",
      versionId: "version-old",
      tier2Provider: "preview_host",
    });

    const result = await startPreviewSession(
      [
        {
          path: "app/page.tsx",
          content: "export default function Page(){return <main/>;}",
          language: "typescript",
        },
      ],
      {
        chatId: "chat-3",
        versionIdForSession: "version-new",
        forceRestart: true,
        skipProjectScaffold: true,
        skipRepair: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(destroyPreviewHostSession).toHaveBeenCalledWith({ previewSessionId: "ps-old" });
    expect(startPreviewHostSession).toHaveBeenCalledOnce();
  });
});
