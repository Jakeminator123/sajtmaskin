/**
 * GitHub App installation tokens for Sajtmaskin's own GitHub organisation.
 *
 * Why an App and not a personal token: an App is owned by the organisation,
 * installed only where we say, carries only the permissions we grant
 * (`contents: write`, `administration: write` to create repos) and mints
 * short-lived tokens (1 hour). No human account, no long-lived secret in a
 * customer path. This is the auth for the planned "säkerhetskopia till
 * Sajtmaskins GitHub vid publicering" and for repo hand-over to a customer.
 *
 * Flow (GitHub docs, "Generating an installation access token"):
 *   1. Sign a JWT with the App's private key (RS256, iss = app id, ≤10 min).
 *   2. `POST /app/installations/{id}/access_tokens` with that JWT.
 *   3. Use the returned token as `Authorization: Bearer`.
 *
 * Node's `crypto` does RS256 natively, so no JWT dependency. The private key
 * env value is a PEM; Vercel keeps newlines, but `\n`-escaped single-line
 * values are accepted too.
 */
import { createSign } from "node:crypto";

export interface GitHubAppConfig {
  appId: string;
  /** PEM, either multi-line or with `\n` escapes. */
  privateKey: string;
  installationId: string;
}

export interface GitHubInstallationToken {
  token: string;
  /** ISO timestamp from GitHub. */
  expiresAt: string;
}

const GITHUB_API = "https://api.github.com";
/** Refresh this long before expiry so an in-flight export never sees a 401. */
const REFRESH_MARGIN_MS = 60_000;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * App JWT per GitHub's spec: `iat` 60 s in the past to absorb clock skew,
 * `exp` at most 10 minutes ahead.
 */
export function createGitHubAppJwt(
  config: Pick<GitHubAppConfig, "appId" | "privateKey">,
  now: Date = new Date(),
): string {
  const seconds = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 9 * 60, iss: config.appId }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = base64Url(signer.sign(normalizePrivateKey(config.privateKey)));
  return `${header}.${payload}.${signature}`;
}

type FetchLike = typeof fetch;

export interface InstallationTokenClientOptions {
  fetchImpl?: FetchLike;
  now?: () => Date;
}

/**
 * Mints and caches one installation token per process. Callers get a fresh
 * token when the cached one is within {@link REFRESH_MARGIN_MS} of expiry.
 */
export function createInstallationTokenClient(
  config: GitHubAppConfig,
  options: InstallationTokenClientOptions = {},
): { getToken: () => Promise<GitHubInstallationToken> } {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  let cached: GitHubInstallationToken | null = null;
  let inFlight: Promise<GitHubInstallationToken> | null = null;

  async function mint(): Promise<GitHubInstallationToken> {
    const jwt = createGitHubAppJwt(config, now());
    const response = await fetchImpl(
      `${GITHUB_API}/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "User-Agent": "sajtmaskin",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    const data = (await response.json().catch(() => null)) as {
      token?: string;
      expires_at?: string;
      message?: string;
    } | null;
    if (!response.ok || !data?.token || !data.expires_at) {
      throw new Error(
        `GitHub App installation token request failed (${response.status})${
          data?.message ? `: ${data.message}` : ""
        }`,
      );
    }
    return { token: data.token, expiresAt: data.expires_at };
  }

  return {
    async getToken() {
      if (cached && new Date(cached.expiresAt).getTime() - now().getTime() > REFRESH_MARGIN_MS) {
        return cached;
      }
      if (!inFlight) {
        inFlight = mint()
          .then((token) => {
            cached = token;
            return token;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    },
  };
}
