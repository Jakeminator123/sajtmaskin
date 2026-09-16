import { ImportInitError } from "./github-import-errors";

export type GithubRepoRef = {
  owner: string;
  repo: string;
};

export type ParsedGithubImportUrl =
  | {
      ok: true;
      owner: string;
      repo: string;
      kind: "root";
    }
  | {
      ok: true;
      owner: string;
      repo: string;
      kind: "tree";
      pathSegments: string[];
    }
  | {
      ok: true;
      owner: string;
      repo: string;
      kind: "commit";
      sha: string;
    };

function decodeOnce(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ImportInitError({
      message: "GitHub-adressen innehåller ogiltig URL-kodning.",
      code: "github_url_invalid",
      step: "parse",
      status: 400,
    });
  }
}

export function parseGithubRepo(repoUrl: string): GithubRepoRef | null {
  try {
    const url = new URL(repoUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "github.com") return null;
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return null;
    return { owner, repo: repoRaw.replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

/**
 * Parse a GitHub web/clone URL. Tree segments stay complete so
 * `feature/new-ui` is not truncated to `feature`.
 */
export function parseGithubImportUrl(inputUrl: string): ParsedGithubImportUrl {
  let url: URL;
  try {
    url = new URL(inputUrl.trim());
  } catch {
    throw new ImportInitError({
      message: "Ogiltig GitHub-adress.",
      code: "github_url_invalid",
      step: "parse",
      status: 400,
    });
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "github.com") {
    throw new ImportInitError({
      message: "Bara github.com-adresser kan importeras.",
      code: "github_url_invalid",
      step: "parse",
      status: 400,
    });
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodeOnce);
  const owner = parts[0];
  const repoRaw = parts[1];
  if (!owner || !repoRaw) {
    throw new ImportInitError({
      message: "Ogiltig GitHub-adress. Ange ägare och repository.",
      code: "github_url_invalid",
      step: "parse",
      status: 400,
    });
  }

  const repo = repoRaw.replace(/\.git$/i, "");
  const rest = parts.slice(2).filter((part) => part.length > 0 && part !== ".git");

  if (rest.length === 0) {
    return { ok: true, owner, repo, kind: "root" };
  }

  const qualifier = rest[0]?.toLowerCase();
  if (qualifier === "tree" || qualifier === "blob") {
    const pathSegments = rest.slice(1);
    if (pathSegments.length === 0) {
      return { ok: true, owner, repo, kind: "root" };
    }
    return { ok: true, owner, repo, kind: "tree", pathSegments };
  }

  if (qualifier === "commit" || qualifier === "commits") {
    const sha = rest[1];
    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
      throw new ImportInitError({
        message: "Ogiltig commit-adress.",
        code: "github_url_invalid",
        step: "parse",
        status: 400,
      });
    }
    return { ok: true, owner, repo, kind: "commit", sha };
  }

  throw new ImportInitError({
    message: "GitHub-adressen pekar inte på ett repository, en branch eller en commit.",
    code: "github_url_invalid",
    step: "parse",
    status: 400,
  });
}

export function candidateRefPrefixes(pathSegments: string[]): string[] {
  const prefixes: string[] = [];
  for (let end = pathSegments.length; end >= 1; end -= 1) {
    prefixes.push(pathSegments.slice(0, end).join("/"));
  }
  return prefixes;
}
