import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_EXPORT_MANIFEST_PATH } from "@/lib/gen/export/github-tree-plan";
import { GitHubExportNoFilesError, commitExportToGitHub } from "./git-data-export";

type TreeEntry = { path: string; sha?: string | null; content?: string };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal GitHub double for an org repo that already has one commit. */
function installGitHubMock() {
  const recorded: { tree: TreeEntry[] | null; blobPosts: number; createdUnder: string | null } = {
    tree: null,
    blobPosts: 0,
    createdUnder: null,
  };
  let repoExists = false;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    const pathname = new URL(url).pathname.replace(/^\/+/, "");

    if (method === "GET" && pathname === "repos/sites/site-1") {
      if (!repoExists) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ full_name: "sites/site-1", html_url: "https://github.com/sites/site-1", default_branch: "main" });
    }
    if (method === "POST" && pathname === "orgs/sites/repos") {
      repoExists = true;
      recorded.createdUnder = "orgs/sites";
      return jsonResponse({ full_name: "sites/site-1", html_url: "https://github.com/sites/site-1", default_branch: "main" }, 201);
    }
    if (method === "GET" && pathname === "repos/sites/site-1/git/refs/heads/main") {
      return jsonResponse({ object: { sha: "commit-base" } });
    }
    if (method === "GET" && pathname === "repos/sites/site-1/git/commits/commit-base") {
      return jsonResponse({ sha: "commit-base", tree: { sha: "tree-base" } });
    }
    if (method === "GET" && pathname === "repos/sites/site-1/git/trees/tree-base") {
      return jsonResponse({ tree: [], truncated: false });
    }
    if (method === "POST" && pathname === "repos/sites/site-1/git/blobs") {
      recorded.blobPosts += 1;
      return jsonResponse({ sha: `blob-${recorded.blobPosts}` });
    }
    if (method === "POST" && pathname === "repos/sites/site-1/git/trees") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tree?: TreeEntry[]; base_tree?: string };
      recorded.tree = body.tree ?? [];
      expect(body.base_tree).toBe("tree-base");
      return jsonResponse({ sha: "tree-new" });
    }
    if (method === "POST" && pathname === "repos/sites/site-1/git/commits") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { parents?: string[] };
      expect(body.parents).toEqual(["commit-base"]);
      return jsonResponse({ sha: "commit-new", tree: { sha: "tree-new" } });
    }
    if (method === "PATCH" && pathname === "repos/sites/site-1/git/refs/heads/main") {
      return jsonResponse({ object: { sha: "commit-new" } });
    }
    return jsonResponse({ message: `Unhandled ${method} ${url}` }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, recorded };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commitExportToGitHub", () => {
  it("inlines text files in one tree request and uploads blobs only for binaries and empty files", async () => {
    const { recorded } = installGitHubMock();

    const result = await commitExportToGitHub({
      token: "ghs_x",
      owner: "sites",
      repo: "site-1",
      isPrivate: true,
      ownerIsOrg: true,
      files: [
        { path: "app/page.tsx", content: "export default function Page(){}" },
        { path: "public/.gitkeep", content: "" },
        { path: "public/logo.png", content: Buffer.from([137, 80, 78, 71]) },
      ],
      commitMessage: "Publish dpl_1",
      textTransport: "inline",
    });

    expect(result).toMatchObject({ created: true, commitSha: "commit-new", deletedCount: 0 });
    expect(recorded.createdUnder).toBe("orgs/sites");
    // Manifest + empty file + binary = three blobs; the page and the manifest… no:
    // the manifest is text and inlined, so only the empty file and the binary are blobs.
    expect(recorded.blobPosts).toBe(2);
    const byPath = new Map(recorded.tree?.map((entry) => [entry.path, entry]));
    expect(byPath.get("app/page.tsx")?.content).toBe("export default function Page(){}");
    expect(byPath.get(GITHUB_EXPORT_MANIFEST_PATH)?.content).toBeDefined();
    expect(byPath.get("public/.gitkeep")?.sha).toBe("blob-1");
    expect(byPath.get("public/logo.png")?.sha).toBe("blob-2");
  });

  it("uploads every file as a blob in blob transport", async () => {
    const { recorded } = installGitHubMock();
    await commitExportToGitHub({
      token: "ghs_x",
      owner: "sites",
      repo: "site-1",
      isPrivate: true,
      ownerIsOrg: true,
      files: [{ path: "app/page.tsx", content: "x" }],
      commitMessage: "Export",
    });
    // page + manifest
    expect(recorded.blobPosts).toBe(2);
    expect(recorded.tree?.every((entry) => entry.content === undefined)).toBe(true);
  });

  it("refuses an export with no files before touching GitHub", async () => {
    const { fetchMock } = installGitHubMock();
    await expect(
      commitExportToGitHub({
        token: "ghs_x",
        owner: "sites",
        repo: "site-1",
        isPrivate: true,
        ownerIsOrg: true,
        files: [],
        commitMessage: "Export",
      }),
    ).rejects.toBeInstanceOf(GitHubExportNoFilesError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
