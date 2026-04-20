const CONNECT_API_URL = process.env.CONNECT_API_URL;
const CONNECT_API_KEY = process.env.CONNECT_API_KEY;
const MEDIA_BASE_PATH = process.env.MEDIA_BASE_PATH;

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const glideConfig = {
  apiUrl: requireEnv("CONNECT_API_URL", CONNECT_API_URL),
  apiKey: requireEnv("CONNECT_API_KEY", CONNECT_API_KEY),
  mediaBasePath: requireEnv("MEDIA_BASE_PATH", MEDIA_BASE_PATH),
  environment: process.env.ENVIRONMENT || "prod",
  pregeneratePaths: process.env.PREGENERATE_PATHS === "true",
};

export async function glideFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, glideConfig.apiUrl).toString();

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${glideConfig.apiKey}`,
      ...(init?.headers || {}),
    },
    next: init?.cache ? undefined : { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Glide API request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export function resolveGlideMediaUrl(path: string) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path.replace(/^\//, ""), glideConfig.mediaBasePath.endsWith("/") ? glideConfig.mediaBasePath : `${glideConfig.mediaBasePath}/`).toString();
}
