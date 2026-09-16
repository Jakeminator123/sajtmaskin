import { safeFetch, validateSsrfTarget } from "@/lib/ssrf-guard";
import { ImportInitError } from "./github-import-errors";
import {
  GITHUB_IMPORT_USER_AGENT,
  MAX_REMOTE_ARCHIVE_BYTES,
  type ImportErrorCode,
} from "./import-init-contract";
import {
  candidateRefPrefixes,
  parseGithubImportUrl,
  type GithubRepoRef,
} from "./github-repo-ref";

export type GithubRepoMeta = {
  private: boolean;
  defaultBranch: string;
};

export type ResolvedGithubImport = {
  repo: GithubRepoRef;
  branch: string;
  commitSha: string;
  private: boolean;
};

export function githubImportHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": GITHUB_IMPORT_USER_AGENT,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function mapGithubHttpError(status: number, step: "github_meta" | "github_ref" | "download"): ImportInitError {
  if (status === 401) {
    return new ImportInitError({
      message: "GitHub-kopplingen saknas eller är ogiltig. Anslut GitHub igen.",
      code: "github_auth_required",
      step,
      status: 401,
      requiresAuth: false,
    });
  }
  if (status === 403) {
    return new ImportInitError({
      message: "GitHub nekade åtkomst. Kontrollera att kopplingen har rätt behörighet.",
      code: "github_forbidden",
      step,
      status: 403,
    });
  }
  if (status === 404) {
    return new ImportInitError({
      message: "Repot finns inte eller så saknar du åtkomst.",
      code: "github_not_found",
      step,
      status: 404,
    });
  }
  if (status === 429) {
    return new ImportInitError({
      message: "GitHub begränsar just nu antalet anrop. Försök igen om en stund.",
      code: "github_rate_limited",
      step,
      status: 429,
    });
  }
  return new ImportInitError({
    message: `GitHub svarade med HTTP ${status}.`,
    code: "github_unavailable",
    step,
    status: status >= 400 && status < 600 ? status : 502,
  });
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof Error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message))) ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function isSafeFetchSsrfBlock(status: number, body: string): boolean {
  if (status !== 400 && status !== 403) return false;
  return (
    body.includes("Request blocked") ||
    body.includes("Redirect blocked") ||
    body === "Invalid URL" ||
    body === "Too many redirects"
  );
}

export async function githubApiGet(params: {
  url: string;
  token?: string | null;
  timeoutMs?: number;
}): Promise<Response> {
  try {
    return await safeFetch(params.url, {
      headers: githubImportHeaders(params.token),
      timeoutMs: params.timeoutMs ?? 15_000,
      maxBodyBytes: 2 * 1024 * 1024,
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ImportInitError({
        message: "Tidsgränsen mot GitHub gick ut.",
        code: "github_timeout",
        step: "github_meta",
        status: 504,
      });
    }
    throw new ImportInitError({
      message: "Kunde inte nå GitHub.",
      code: "github_unavailable",
      step: "github_meta",
      status: 502,
    });
  }
}

export async function fetchGithubRepoMeta(
  repo: GithubRepoRef,
  token?: string | null,
): Promise<GithubRepoMeta> {
  const response = await githubApiGet({
    url: `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,
    token,
  });

  if (!response.ok) {
    throw mapGithubHttpError(response.status, "github_meta");
  }

  const data = (await response.json()) as { private?: boolean; default_branch?: string };
  return {
    private: Boolean(data.private),
    defaultBranch: typeof data.default_branch === "string" ? data.default_branch : "",
  };
}

async function resolveCommitSha(params: {
  repo: GithubRepoRef;
  ref: string;
  token?: string | null;
}): Promise<string | null> {
  const response = await githubApiGet({
    url: `https://api.github.com/repos/${encodeURIComponent(params.repo.owner)}/${encodeURIComponent(params.repo.repo)}/commits/${encodeURIComponent(params.ref)}`,
    token: params.token,
  });

  if (response.status === 404 || response.status === 422) {
    return null;
  }
  if (!response.ok) {
    throw mapGithubHttpError(response.status, "github_ref");
  }
  const data = (await response.json()) as { sha?: string };
  return typeof data.sha === "string" && data.sha.trim() ? data.sha.trim() : null;
}

async function resolveTreeRef(params: {
  repo: GithubRepoRef;
  pathSegments: string[];
  token?: string | null;
}): Promise<{ branch: string; commitSha: string }> {
  const prefixes = candidateRefPrefixes(params.pathSegments);
  for (const candidate of prefixes) {
    const sha = await resolveCommitSha({
      repo: params.repo,
      ref: candidate,
      token: params.token,
    });
    if (!sha) continue;
    const leftover = params.pathSegments.join("/").slice(candidate.length).replace(/^\//, "");
    if (leftover.length > 0) {
      throw new ImportInitError({
        message:
          "Adressen pekar på en katalog i repot. Importera repository-roten, eller ange branchen uttryckligen.",
        code: "github_subdir_unsupported",
        step: "github_ref",
        status: 400,
      });
    }
    return { branch: candidate, commitSha: sha };
  }

  throw new ImportInitError({
    message: "Kunde inte hitta den angivna branchen eller committen.",
    code: "github_ref_invalid",
    step: "github_ref",
    status: 400,
  });
}

export async function resolveGithubImport(params: {
  url: string;
  explicitBranch?: string;
  token?: string | null;
}): Promise<ResolvedGithubImport> {
  const parsed = parseGithubImportUrl(params.url);
  const repo = { owner: parsed.owner, repo: parsed.repo };
  const meta = await fetchGithubRepoMeta(repo, params.token);
  const explicit = params.explicitBranch?.trim() ?? "";

  if (parsed.kind === "commit" && !explicit) {
    return {
      repo,
      branch: parsed.sha,
      commitSha: parsed.sha,
      private: meta.private,
    };
  }

  if (explicit) {
    const sha = await resolveCommitSha({ repo, ref: explicit, token: params.token });
    if (!sha) {
      throw new ImportInitError({
        message: "Den angivna branchen eller committen finns inte.",
        code: "github_ref_invalid",
        step: "github_ref",
        status: 400,
      });
    }
    if (parsed.kind === "tree") {
      const leftover = parsed.pathSegments.join("/");
      const leftoverAfterBranch = leftover.startsWith(explicit)
        ? leftover.slice(explicit.length).replace(/^\//, "")
        : leftover;
      if (leftoverAfterBranch.length > 0 && leftover.startsWith(explicit)) {
        throw new ImportInitError({
          message:
            "Adressen pekar på en katalog i repot. Importera repository-roten, eller ange branchen uttryckligen.",
          code: "github_subdir_unsupported",
          step: "github_ref",
          status: 400,
        });
      }
    }
    return { repo, branch: explicit, commitSha: sha, private: meta.private };
  }

  if (parsed.kind === "tree") {
    const resolved = await resolveTreeRef({
      repo,
      pathSegments: parsed.pathSegments,
      token: params.token,
    });
    return { repo, ...resolved, private: meta.private };
  }

  const defaultBranch = meta.defaultBranch.trim();
  if (!defaultBranch) {
    throw new ImportInitError({
      message: "Kunde inte avgöra standardbranchen. Ange en branch.",
      code: "github_ref_invalid",
      step: "github_ref",
      status: 400,
    });
  }
  const sha = await resolveCommitSha({ repo, ref: defaultBranch, token: params.token });
  if (!sha) {
    throw new ImportInitError({
      message: "Kunde inte läsa standardbranchen.",
      code: "github_ref_invalid",
      step: "github_ref",
      status: 400,
    });
  }
  return { repo, branch: defaultBranch, commitSha: sha, private: meta.private };
}

const ZIP_UPSTREAM_ERRORS: Record<number, { message: string; code: ImportErrorCode }> = {
  401: { message: "Nedladdningen av arkivet nekades.", code: "zip_unauthorized" },
  403: { message: "Nedladdningen av arkivet är förbjuden.", code: "zip_forbidden" },
  404: { message: "Arkivet hittades inte.", code: "zip_not_found" },
  429: { message: "Nedladdningen begränsas just nu. Försök igen om en stund.", code: "zip_rate_limited" },
};

export async function downloadZipBufferFromUrl(params: {
  url: string;
  maxBytes: number;
  headers?: Record<string, string>;
}): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(params.url);
  } catch {
    throw new ImportInitError({
      message: "Ogiltig ZIP-adress.",
      code: "zip_invalid",
      step: "download",
      status: 400,
    });
  }
  const ssrfCheck = validateSsrfTarget(parsed);
  if (!ssrfCheck.ok) {
    throw new ImportInitError({
      message: "ZIP-adressen är inte tillåten.",
      code: "zip_url_blocked",
      step: "download",
      status: 400,
    });
  }

  let response: Response;
  try {
    response = await safeFetch(params.url, {
      headers: params.headers,
      timeoutMs: 30_000,
      maxBodyBytes: params.maxBytes,
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ImportInitError({
        message: "Tidsgränsen för ZIP-nedladdningen gick ut.",
        code: "github_timeout",
        step: "download",
        status: 504,
      });
    }
    throw new ImportInitError({
      message: "Kunde inte ladda ner ZIP-arkivet.",
      code: "import_failed",
      step: "download",
      status: 502,
    });
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new ImportInitError({
        message: "ZIP-arkivet är för stort för import.",
        code: "zip_too_large",
        step: "download",
        status: 413,
      });
    }
    const body = await response.text();
    if (isSafeFetchSsrfBlock(response.status, body)) {
      throw new ImportInitError({
        message: "ZIP-adressen är inte tillåten.",
        code: "zip_url_blocked",
        step: "download",
        status: 400,
      });
    }
    const mapped = ZIP_UPSTREAM_ERRORS[response.status];
    if (mapped) {
      throw new ImportInitError({
        message: mapped.message,
        code: mapped.code,
        step: "download",
        status: response.status,
      });
    }
    throw new ImportInitError({
      message: `Kunde inte ladda ner ZIP-arkivet (HTTP ${response.status}).`,
      code: "import_failed",
      step: "download",
      status: 500,
    });
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > params.maxBytes) {
    throw new ImportInitError({
      message: "ZIP-arkivet är för stort för import.",
      code: "zip_too_large",
      step: "download",
      status: 413,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > params.maxBytes) {
    throw new ImportInitError({
      message: "ZIP-arkivet är för stort för import.",
      code: "zip_too_large",
      step: "download",
      status: 413,
    });
  }

  return buffer;
}

export async function downloadGithubZipBuffer(params: {
  repo: GithubRepoRef;
  commitSha: string;
  token?: string | null;
  maxBytes?: number;
}): Promise<Buffer> {
  if (params.token) {
    return downloadZipBufferFromUrl({
      url: `https://api.github.com/repos/${encodeURIComponent(params.repo.owner)}/${encodeURIComponent(params.repo.repo)}/zipball/${encodeURIComponent(params.commitSha)}`,
      maxBytes: params.maxBytes ?? MAX_REMOTE_ARCHIVE_BYTES,
      headers: githubImportHeaders(params.token),
    });
  }

  return downloadZipBufferFromUrl({
    url: `https://github.com/${params.repo.owner}/${params.repo.repo}/archive/${params.commitSha}.zip`,
    maxBytes: params.maxBytes ?? MAX_REMOTE_ARCHIVE_BYTES,
    headers: {
      "User-Agent": GITHUB_IMPORT_USER_AGENT,
    },
  });
}

export function assertPrivateGithubAccess(params: {
  isPrivate: boolean;
  token?: string | null;
}): void {
  if (!params.isPrivate) return;
  if (params.token) return;
  throw new ImportInitError({
    message: "Anslut GitHub för att importera privata repon.",
    code: "github_auth_required",
    step: "github_meta",
    status: 401,
  });
}
