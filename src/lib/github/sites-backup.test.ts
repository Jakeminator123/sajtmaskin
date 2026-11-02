import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getVersionById = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn());
const buildPortableExportProject = vi.hoisted(() => vi.fn());
const loadProjectExportMedia = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const commitExportToGitHub = vi.hoisted(() => vi.fn());
const getToken = vi.hoisted(() => vi.fn());
const features = vi.hoisted(() => ({ useGitHubSitesOrg: true }));

vi.mock("@/lib/config", () => ({
  FEATURES: features,
  SECRETS: {
    githubAppId: "1",
    githubAppPrivateKey: "pem",
    githubAppInstallationId: "2",
    githubSitesOrg: "sajtmaskin-sites",
  },
}));
vi.mock("@/lib/db/chat-repository-pg", () => ({ getVersionById }));
vi.mock("@/lib/gen/version-manager", () => ({ parseCodeFilesFromFilesJson }));
vi.mock("@/lib/gen/export/build-portable-export-project", () => ({ buildPortableExportProject }));
vi.mock("@/lib/projects/project-export-media", () => ({ loadProjectExportMedia }));
vi.mock("@/lib/db/services/projects", () => ({ saveProjectData, getProjectData }));
vi.mock("./app-installation-token", () => ({
  createInstallationTokenClient: () => ({ getToken }),
}));
vi.mock("./git-data-export", async (importOriginal) => {
  const original = await importOriginal<typeof import("./git-data-export")>();
  return { ...original, commitExportToGitHub };
});

const { backupPublishedVersion, backupRepoNameForProject, resetSitesBackupTokenClientForTests } =
  await import("./sites-backup");

const PARAMS = {
  projectId: "proj_1",
  chatId: "chat_1",
  versionId: "ver_1",
  deploymentId: "dpl_1",
  userId: "user_1",
};

describe("backupPublishedVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.useGitHubSitesOrg = true;
    resetSitesBackupTokenClientForTests();
    getVersionById.mockResolvedValue({ id: "ver_1", chat_id: "chat_1", files_json: "[]" });
    getProjectData.mockResolvedValue({ meta: {} });
    parseCodeFilesFromFilesJson.mockReturnValue([{ path: "app/page.tsx", content: "raw" }]);
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}", language: "tsx" },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_live_123", language: "text" },
    ]);
    loadProjectExportMedia.mockResolvedValue([
      {
        id: 7,
        originalName: "Hero Bild.PNG",
        mimeType: "image/png",
        body: Buffer.from([137, 80]),
        sourceUrls: [],
      },
    ]);
    getToken.mockResolvedValue({ token: "ghs_x", expiresAt: "2026-10-22T11:00:00Z" });
    commitExportToGitHub.mockResolvedValue({
      repo: {
        full_name: "sajtmaskin-sites/site-proj_1",
        html_url: "https://github.com/sajtmaskin-sites/site-proj_1",
        default_branch: "main",
      },
      created: true,
      commitSha: "abc123",
      fileCount: 3,
      deletedCount: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null and touches nothing when the feature is off", async () => {
    features.useGitHubSitesOrg = false;
    expect(await backupPublishedVersion(PARAMS)).toBeNull();
    expect(getVersionById).not.toHaveBeenCalled();
    expect(commitExportToGitHub).not.toHaveBeenCalled();
  });

  it("commits the sanitized version plus media to the org repo with inline text and records it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));

    const status = await backupPublishedVersion(PARAMS);

    expect(commitExportToGitHub).toHaveBeenCalledTimes(1);
    const call = commitExportToGitHub.mock.calls[0][0];
    expect(call).toMatchObject({
      token: "ghs_x",
      owner: "sajtmaskin-sites",
      repo: "site-proj_1",
      isPrivate: true,
      requirePrivate: true,
      ownerIsOrg: true,
      textTransport: "inline",
    });
    expect(call.commitMessage).toContain("dpl_1");
    const paths = call.files.map((file: { path: string }) => file.path);
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("public/media/7-Hero-Bild.png");
    // Secrets are stripped the same way as the customer export.
    const envFile = call.files.find((file: { path: string }) => file.path === ".env.local");
    expect(envFile?.content ?? "").not.toContain("sk_live_123");

    expect(saveProjectData).toHaveBeenCalledWith({
      project_id: "proj_1",
      meta_patch: {
        githubBackup: {
          repo: "sajtmaskin-sites/site-proj_1",
          repoUrl: "https://github.com/sajtmaskin-sites/site-proj_1",
          commitSha: "abc123",
          versionId: "ver_1",
          deploymentId: "dpl_1",
          at: "2026-10-22T10:00:00.000Z",
        },
      },
    });
    expect(status?.commitSha).toBe("abc123");
  });

  it("rewrites a marked business-facts module from the current facts so a hand-over has today's hours", async () => {
    const { BUSINESS_FACTS_MODULE_MARKER, BUSINESS_FACTS_MODULE_PATH } = await import(
      "@/lib/projects/business-facts-module"
    );
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}", language: "tsx" },
      { path: BUSINESS_FACTS_MODULE_PATH, content: `${BUSINESS_FACTS_MODULE_MARKER}\n// old hours`, language: "ts" },
    ]);
    getProjectData.mockResolvedValue({
      meta: {
        business: {
          hours: { mode: "always_open", week: null },
          contact: { phone: null, email: null, orgNumber: null, address: null },
        },
      },
    });

    await backupPublishedVersion(PARAMS);

    const call = commitExportToGitHub.mock.calls[0][0];
    const moduleFile = call.files.find((file: { path: string }) => file.path === BUSINESS_FACTS_MODULE_PATH);
    expect(moduleFile?.content).toContain('"mode": "always_open"');
    expect(moduleFile?.content).not.toContain("// old hours");
  });

  it("backs up the exact published snapshot when the deploy route provides it", async () => {
    const published = [
      { path: "app/page.tsx", content: "export default function Page(){ return 'live' }" },
      { path: "lib/business-facts.ts", content: "// @sajtmaskin business-facts v1\nexport const x = 1;" },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_live_999" },
    ];
    getProjectData.mockResolvedValue({
      meta: { business: { hours: { mode: "by_appointment", week: null }, contact: {} } },
    });

    await backupPublishedVersion({ ...PARAMS, publishedFiles: published });

    // The snapshot wins: no rebuild from the stored version, no facts re-read.
    expect(buildPortableExportProject).not.toHaveBeenCalled();
    const call = commitExportToGitHub.mock.calls[0][0];
    const byPath = new Map(call.files.map((file: { path: string; content: unknown }) => [file.path, file.content]));
    expect(byPath.get("app/page.tsx")).toBe("export default function Page(){ return 'live' }");
    expect(byPath.get("lib/business-facts.ts")).toContain("export const x = 1;");
    expect(String(byPath.get(".env.local") ?? "")).not.toContain("sk_live_999");
    // Media still rides along.
    expect(byPath.has("public/media/7-Hero-Bild.png")).toBe(true);
  });

  it("skips user-scoped media for session projects", async () => {
    await backupPublishedVersion({ ...PARAMS, userId: null });
    expect(loadProjectExportMedia).not.toHaveBeenCalled();
    expect(commitExportToGitHub).toHaveBeenCalledTimes(1);
  });

  it("refuses a version that belongs to another chat", async () => {
    getVersionById.mockResolvedValue({ id: "ver_1", chat_id: "chat_other", files_json: "[]" });
    await expect(backupPublishedVersion(PARAMS)).rejects.toThrow(/does not belong/);
    expect(commitExportToGitHub).not.toHaveBeenCalled();
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("names repos by project id, never by customer name", () => {
    expect(backupRepoNameForProject("proj_1")).toBe("site-proj_1");
    expect(backupRepoNameForProject("Kund AB ö")).toBe("site-Kund-AB");
  });
});
