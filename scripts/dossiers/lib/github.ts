/**
 * Shared GitHub helper for the dossier pipeline.
 *
 * Used by:
 *   - scripts/dossiers/compat-test.ts          (runtime guard for active dossiers)
 *   - scripts/dossiers/enrich-with-github-api.ts  (bulk enrich for scrape output)
 *   - scripts/dossiers/import-from-enriched.ts (skip archived candidates pre-import)
 *   - scripts/dossiers/clone-draft-repos.ts    (resolve default_branch + subpath)
 *
 * Anonymous limit: 60 req/h. With GITHUB_TOKEN: 5000/h.
 */

export interface ParsedRepoRef {
  owner: string;
  repo: string;
  /** Subpath inside repo (after `#` or `/tree/<branch>/`), e.g. `examples/blog-starter`. */
  subpath: string | null;
}

export interface GithubRepoData {
  archived: boolean;
  pushed_at: string;
  default_branch: string;
  topics: string[];
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
}

export interface GithubFetchOk {
  ok: true;
  data: GithubRepoData;
}
export interface GithubFetchError {
  ok: false;
  status: number;
  message: string;
}

/**
 * Parse a GitHub URL into owner/repo (+ optional subpath).
 *
 * Accepts:
 *   https://github.com/<owner>/<repo>
 *   https://github.com/<owner>/<repo>/tree/<branch>/<subpath...>
 *   https://github.com/<owner>/<repo>#examples/<name>     (Sajtmaskin convention)
 *   git@github.com:<owner>/<repo>.git
 */
export function parseRepoRef(url: string): ParsedRepoRef | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;

  const ssh = /^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i.exec(trimmed);
  if (ssh) return { owner: ssh[1], repo: ssh[2], subpath: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;

  const hashSubpath = parsed.hash ? parsed.hash.replace(/^#/, "") : "";
  const segments = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length < 2) return null;
  const [owner, repo, ...rest] = segments;
  if (!owner || !repo) return null;

  let subpath: string | null = hashSubpath || null;
  if (!subpath && rest.length >= 2 && rest[0] === "tree") {
    subpath = rest.slice(2).join("/") || null;
  }

  return {
    owner,
    repo: repo.replace(/\.git$/i, ""),
    subpath,
  };
}

/**
 * Fetch GET /repos/<owner>/<repo>. Token optional but strongly recommended for
 * bulk operations (>60 calls).
 */
export async function fetchGithubRepo(
  ref: ParsedRepoRef,
  token?: string,
): Promise<GithubFetchOk | GithubFetchError> {
  const apiUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const headers: Record<string, string> = {
    "User-Agent": "sajtmaskin-dossier-pipeline",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    let msg = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) msg = body.message;
    } catch {
      /* keep statusText */
    }
    return { ok: false, status: response.status, message: msg };
  }

  const body = (await response.json()) as Partial<GithubRepoData> & {
    archived?: boolean;
    pushed_at?: string;
    default_branch?: string;
    topics?: string[];
  };

  return {
    ok: true,
    data: {
      archived: Boolean(body.archived),
      pushed_at: String(body.pushed_at ?? ""),
      default_branch: String(body.default_branch ?? ""),
      topics: Array.isArray(body.topics) ? body.topics : [],
      language: typeof body.language === "string" ? body.language : null,
      stargazers_count: Number(body.stargazers_count ?? 0),
      open_issues_count: Number(body.open_issues_count ?? 0),
    },
  };
}

/** Days since `pushed_at`. Returns null on unparseable input. */
export function ageInDays(pushedAt: string): number | null {
  if (!pushedAt) return null;
  const t = Date.parse(pushedAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export const STALE_AGE_DAYS = 18 * 30;

/** Verdict shared between compat-test and enrich tooling. */
export type SourceVerdict =
  | "ok"
  | "source-archived"
  | "source-stale"
  | "source-unreachable"
  | "no-source";

export interface VerdictInput {
  hasSourceUrl: boolean;
  parsed: ParsedRepoRef | null;
  github: GithubRepoData | null;
  fetchError: GithubFetchError | null;
  ageDays: number | null;
  staleAgeDays?: number;
}

export function computeSourceVerdict(input: VerdictInput): {
  verdict: SourceVerdict;
  reasons: string[];
} {
  const reasons: string[] = [];
  const stale = input.staleAgeDays ?? STALE_AGE_DAYS;

  if (!input.hasSourceUrl) {
    reasons.push("manifest has no sourceRepoUrl");
    return { verdict: "no-source", reasons };
  }
  if (!input.parsed) {
    reasons.push("unparseable sourceRepoUrl");
    return { verdict: "source-unreachable", reasons };
  }
  if (input.fetchError) {
    reasons.push(`github api ${input.fetchError.status}: ${input.fetchError.message}`);
    return { verdict: "source-unreachable", reasons };
  }
  if (!input.github) {
    reasons.push("github fetch returned no data");
    return { verdict: "source-unreachable", reasons };
  }
  if (input.github.archived) {
    reasons.push("github_archived: true");
    return { verdict: "source-archived", reasons };
  }
  if (input.ageDays !== null && input.ageDays > stale) {
    reasons.push(`pushed_at ${input.ageDays}d ago (> ${stale}d threshold)`);
    return { verdict: "source-stale", reasons };
  }
  return { verdict: "ok", reasons };
}
