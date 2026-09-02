import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  GITHUB_EXPORT_MANIFEST_PATH,
  serializeGitHubExportManifest,
} from "@/lib/gen/export/github-tree-plan";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn());
const buildPortableExportProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson,
}));

vi.mock("@/lib/gen/export/build-portable-export-project", () => ({
  buildPortableExportProject,
}));

const { POST } = await import("./route");

type TreeEntry =
  | { path: string; mode: "100644"; type: "blob"; sha: string }
  | { path: string; sha: null };

type GitHubState = {
  truncated?: boolean;
  tree?: Array<{ path: string; type: "blob" | "tree" | "commit"; sha?: string }>;
  blobs?: Record<string, string>;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installGitHubMock(state: GitHubState = {}) {
  const recorded: { tree: TreeEntry[] | null } = { tree: null };
  let blobSeq = 0;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    const pathname = new URL(url).pathname.replace(/^\/+/, "");

    if (method === "GET" && pathname === "repos/alice/site") {
      return jsonResponse({
        full_name: "alice/site",
        html_url: "https://github.com/alice/site",
        default_branch: "main",
      });
    }

    if (method === "GET" && pathname === "repos/alice/site/git/refs/heads/main") {
      return jsonResponse({ object: { sha: "commit-base" } });
    }

    if (method === "GET" && pathname === "repos/alice/site/git/commits/commit-base") {
      return jsonResponse({ sha: "commit-base", tree: { sha: "tree-base" } });
    }

    if (method === "GET" && pathname === "repos/alice/site/git/trees/tree-base") {
      return jsonResponse({
        tree: state.tree ?? [],
        truncated: Boolean(state.truncated),
      });
    }

    const blobGet = pathname.match(/^repos\/alice\/site\/git\/blobs\/([^/]+)$/);
    if (method === "GET" && blobGet) {
      const content = state.blobs?.[blobGet[1]];
      if (content == null) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({
        content: Buffer.from(content, "utf8").toString("base64"),
        encoding: "base64",
      });
    }

    if (method === "POST" && pathname === "repos/alice/site/git/blobs") {
      blobSeq += 1;
      return jsonResponse({ sha: `blob-${blobSeq}` });
    }

    if (method === "POST" && pathname === "repos/alice/site/git/trees") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tree?: TreeEntry[] };
      recorded.tree = body.tree ?? [];
      return jsonResponse({ sha: "tree-new" });
    }

    if (method === "POST" && pathname === "repos/alice/site/git/commits") {
      return jsonResponse({ sha: "commit-new", tree: { sha: "tree-new" } });
    }

    if (method === "PATCH" && pathname === "repos/alice/site/git/refs/heads/main") {
      return jsonResponse({ object: { sha: "commit-new" } });
    }

    return jsonResponse({ message: `Unhandled ${method} ${url}` }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, recorded };
}

function exportRequest(): NextRequest {
  return new NextRequest("http://localhost/api/github/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: "chat_1",
      versionId: "ver_1",
      repo: "alice/site",
    }),
  });
}

describe("POST /api/github/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({
      id: "user_1",
      github_token: "ghp_test",
      github_username: "alice",
    });
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionById.mockResolvedValue({ id: "ver_1", chat_id: "chat_1", files_json: "[]" });
    parseCodeFilesFromFilesJson.mockReturnValue([
      { path: "app/page.tsx", content: "raw", language: "tsx" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports an empty file instead of dropping it", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){ return null; }", language: "tsx" },
      { path: "public/.gitkeep", content: "", language: "text" },
    ]);
    const { recorded } = installGitHubMock();

    const res = await POST(exportRequest());

    expect(res.status).toBe(200);
    expect(recorded.tree?.some((entry) => entry.path === "public/.gitkeep" && "sha" in entry && entry.sha)).toBe(
      true,
    );
    expect(recorded.tree?.some((entry) => entry.path === GITHUB_EXPORT_MANIFEST_PATH)).toBe(true);
  });

  it("deletes a previous manifest path that disappeared from the current export", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "page", language: "tsx" },
    ]);
    const { recorded } = installGitHubMock({
      tree: [
        { path: "app/page.tsx", type: "blob", sha: "sha-page" },
        { path: "app/old.tsx", type: "blob", sha: "sha-old" },
        { path: "LICENSE", type: "blob", sha: "sha-license" },
        { path: GITHUB_EXPORT_MANIFEST_PATH, type: "blob", sha: "sha-manifest" },
      ],
      blobs: {
        "sha-manifest": serializeGitHubExportManifest([
          "app/page.tsx",
          "app/old.tsx",
          GITHUB_EXPORT_MANIFEST_PATH,
        ]),
      },
    });

    const res = await POST(exportRequest());

    expect(res.status).toBe(200);
    expect(recorded.tree).toEqual(
      expect.arrayContaining([{ path: "app/old.tsx", sha: null }]),
    );
    expect(recorded.tree?.some((entry) => entry.path === "LICENSE" && entry.sha === null)).toBe(
      false,
    );
  });

  it("preserves a user file that is not in the previous Sajtmaskin manifest", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "page", language: "tsx" },
    ]);
    const { recorded } = installGitHubMock({
      tree: [
        { path: "app/page.tsx", type: "blob", sha: "sha-page" },
        { path: "notes.md", type: "blob", sha: "sha-notes" },
        { path: "README.md", type: "blob", sha: "sha-readme" },
        { path: ".github/workflows/ci.yml", type: "blob", sha: "sha-ci" },
      ],
    });

    const res = await POST(exportRequest());

    expect(res.status).toBe(200);
    expect(recorded.tree?.filter((entry) => entry.sha === null)).toEqual([]);
    expect(recorded.tree?.some((entry) => entry.path === "notes.md")).toBe(false);
  });

  it("fails closed when the existing GitHub tree is truncated", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "app/page.tsx", content: "page", language: "tsx" },
    ]);
    const { recorded } = installGitHubMock({
      truncated: true,
      tree: [{ path: "app/page.tsx", type: "blob", sha: "sha-page" }],
    });

    const res = await POST(exportRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/too large to export safely/);
    expect(recorded.tree).toBeNull();
  });

  it("deletes a previous manifest file so a directory can occupy the same path", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "docs/guide.md", content: "# Guide\n", language: "markdown" },
    ]);
    const { recorded } = installGitHubMock({
      tree: [
        { path: "docs", type: "blob", sha: "sha-docs" },
        { path: GITHUB_EXPORT_MANIFEST_PATH, type: "blob", sha: "sha-manifest" },
      ],
      blobs: {
        "sha-manifest": serializeGitHubExportManifest(["docs", GITHUB_EXPORT_MANIFEST_PATH]),
      },
    });

    const res = await POST(exportRequest());

    expect(res.status).toBe(200);
    expect(recorded.tree).toEqual(
      expect.arrayContaining([
        { path: "docs", sha: null },
        expect.objectContaining({ path: "docs/guide.md", type: "blob" }),
      ]),
    );
  });

  it("refuses a file/directory swap that would delete a user-owned path", async () => {
    buildPortableExportProject.mockResolvedValue([
      { path: "docs/guide.md", content: "# Guide\n", language: "markdown" },
    ]);
    const { recorded } = installGitHubMock({
      tree: [{ path: "docs", type: "blob", sha: "sha-docs" }],
    });

    const res = await POST(exportRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/file\/directory swap/);
    expect(recorded.tree).toBeNull();
  });
});
