import { createHash, randomUUID } from "crypto";
import { getVercelToken } from "@/lib/vercel";
import { normalizeDomainHostname } from "@/lib/live-site-url";

export type VercelDeploymentTarget = "production" | "preview";

type VercelFile = {
  file: string;
  data: string;
  encoding: "base64";
};

export type CreateVercelDeploymentInput = {
  projectName: string;
  target: VercelDeploymentTarget;
  files: VercelFile[];
  envVars?: Record<string, string>;
};

export type CreateVercelDeploymentResult = {
  vercelDeploymentId: string;
  vercelProjectId: string | null;
  url: string | null;
  inspectorUrl: string | null;
  readyState: string | null;
};

export type GetVercelDeploymentResult = {
  vercelDeploymentId: string;
  vercelProjectId: string | null;
  url: string | null;
  inspectorUrl: string | null;
  readyState: string | null;
};

export type VercelProjectDomain = {
  name: string;
  verified: boolean;
};

export type EnsuredVercelProject = {
  id: string;
  name: string;
};

type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" ? (value as JsonObject) : null;
}

function readStringField(obj: JsonObject | null, key: string): string | null {
  if (!obj) return null;
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function extractVercelErrorMessage(payload: unknown): string | null {
  const root = asJsonObject(payload);
  if (!root) return null;

  const errorObj = asJsonObject(root.error);
  const nestedMessage = readStringField(errorObj, "message");
  if (nestedMessage) return nestedMessage;

  return readStringField(root, "message");
}

function getVercelTeamId(): string | null {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId && teamId.trim().length > 0 ? teamId.trim() : null;
}

export function sanitizeVercelProjectName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  const maxLen = 52;
  const truncated = cleaned.slice(0, maxLen).replace(/-+$/, "");

  if (truncated.length > 0) return truncated;

  // Collision-safe fallback (U#69): `Date.now()` alone collides for two
  // deploys created in the same millisecond and is otherwise non-unique.
  // `randomUUID()` is lowercase hex + hyphens, a valid Vercel project-name
  // segment; an 8-char slice keeps it short while staying collision-safe.
  return `sajtmaskin-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** Collision-safe provider name; the human-facing URL is the branded alias. */
export function buildGeneratedVercelProjectName(
  displayName: string,
  appProjectId: string,
): string {
  const readable =
    displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30)
      .replace(/-+$/, "") || "site";
  const suffix = createHash("sha256")
    .update(appProjectId)
    .digest("hex")
    .slice(0, 8);
  return sanitizeVercelProjectName(`sajtmaskin-${readable}-${suffix}`);
}

export function toVercelFilesFromTextFiles(
  files: Array<{ name: string; content: string }>,
): VercelFile[] {
  return files
    .filter((f) => f && typeof f.name === "string" && typeof f.content === "string")
    .map((f) => ({
      file: f.name.replace(/^\/+/, ""),
      data: Buffer.from(f.content, "utf8").toString("base64"),
      encoding: "base64" as const,
    }));
}

export async function createVercelDeployment(
  input: CreateVercelDeploymentInput,
): Promise<CreateVercelDeploymentResult> {
  const token = getVercelToken();
  const teamId = getVercelTeamId();

  const url = new URL("https://api.vercel.com/v13/deployments");
  if (teamId) url.searchParams.set("teamId", teamId);
  url.searchParams.set("skipAutoDetectionConfirmation", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.projectName,
      target: input.target,
      files: input.files,
      ...(input.envVars && Object.keys(input.envVars).length > 0
        ? { env: input.envVars, build: { env: input.envVars } }
        : {}),
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = extractVercelErrorMessage(json) ?? `Vercel deployment failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  const root = asJsonObject(json);
  const deploymentId = readStringField(root, "id");
  if (!deploymentId) {
    throw new Error("Vercel deployment response missing id");
  }

  return {
    vercelDeploymentId: deploymentId,
    vercelProjectId: readStringField(root, "projectId"),
    url: readStringField(root, "url"),
    inspectorUrl: readStringField(root, "inspectorUrl"),
    readyState: readStringField(root, "readyState"),
  };
}

export async function getVercelDeployment(
  vercelDeploymentId: string,
): Promise<GetVercelDeploymentResult> {
  const token = getVercelToken();
  const teamId = getVercelTeamId();

  const url = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(vercelDeploymentId)}`,
  );
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      extractVercelErrorMessage(json) ?? `Vercel deployment fetch failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  const root = asJsonObject(json);
  return {
    vercelDeploymentId,
    vercelProjectId: readStringField(root, "projectId"),
    url: readStringField(root, "url"),
    inspectorUrl: readStringField(root, "inspectorUrl"),
    readyState: readStringField(root, "readyState"),
  };
}

/**
 * Upsert env vars on a Vercel project so they persist across redeploys
 * triggered from the Vercel dashboard or git pushes.
 */
export async function syncEnvVarsToVercelProject(
  vercelProjectId: string,
  envVars: Record<string, string>,
): Promise<{ synced: number; errors: string[] }> {
  if (!vercelProjectId || Object.keys(envVars).length === 0) {
    return { synced: 0, errors: [] };
  }

  const token = getVercelToken();
  const teamId = getVercelTeamId();
  const errors: string[] = [];
  let synced = 0;

  const url = new URL(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(vercelProjectId)}/env`,
  );
  if (teamId) url.searchParams.set("teamId", teamId);
  url.searchParams.set("upsert", "true");

  const body = Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    target: ["production", "preview", "development"],
    type: "encrypted",
  }));

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      synced = body.length;
    } else {
      const json = await res.json().catch(() => null);
      const msg = extractVercelErrorMessage(json) ?? `Vercel env sync failed (HTTP ${res.status})`;
      errors.push(msg);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { synced, errors };
}

/**
 * Idempotently attach an exact Sajtmaskin-owned hostname to one generated
 * hosting project. Exact domains deliberately avoid a shared multi-tenant
 * proxy: each customer site keeps its isolated Vercel project/runtime.
 */
export async function ensureVercelProjectDomain(
  vercelProjectIdOrName: string,
  domain: string,
): Promise<VercelProjectDomain> {
  const hostname = normalizeDomainHostname(domain);
  if (!hostname) throw new Error("Invalid branded domain");

  const token = getVercelToken();
  const teamId = getVercelTeamId();
  const endpoint = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(vercelProjectIdOrName)}/domains`,
  );
  if (teamId) endpoint.searchParams.set("teamId", teamId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const list = await fetch(endpoint.toString(), { headers });
  const listed = await list.json().catch(() => null);
  if (!list.ok) {
    throw new Error(extractVercelErrorMessage(listed) ?? `Vercel domain lookup failed (HTTP ${list.status})`);
  }
  const existing = Array.isArray(asJsonObject(listed)?.domains)
    ? (asJsonObject(listed)?.domains as unknown[])
        .map(asJsonObject)
        .find((entry) => readStringField(entry, "name")?.toLowerCase() === hostname)
    : null;
  if (existing) {
    const providerVerified = asJsonObject(existing)?.verified === true;
    const configured = providerVerified
      ? await isVercelDomainConfigured(hostname, teamId, headers)
      : false;
    if (configured === null) {
      throw new Error("Vercel domain configuration status is temporarily unavailable");
    }
    return {
      name: hostname,
      verified: providerVerified && configured,
    };
  }

  const created = await fetch(endpoint.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ name: hostname }),
  });
  const payload = await created.json().catch(() => null);
  if (!created.ok) {
    throw new Error(extractVercelErrorMessage(payload) ?? `Vercel domain add failed (HTTP ${created.status})`);
  }
  const root = asJsonObject(payload);
  const providerVerified = root?.verified === true;
  const configured = providerVerified
    ? await isVercelDomainConfigured(hostname, teamId, headers)
    : false;
  if (configured === null) {
    throw new Error("Vercel domain configuration status is temporarily unavailable");
  }
  return {
    name: readStringField(root, "name") ?? hostname,
    verified: providerVerified && configured,
  };
}

async function isVercelDomainConfigured(
  hostname: string,
  teamId: string | null,
  headers: Record<string, string>,
): Promise<boolean | null> {
  const configUrl = new URL(
    `https://api.vercel.com/v6/domains/${encodeURIComponent(hostname)}/config`,
  );
  if (teamId) configUrl.searchParams.set("teamId", teamId);
  const response = await fetch(configUrl.toString(), { headers });
  if (!response.ok) return null;
  const config = asJsonObject(await response.json().catch(() => null));
  return config ? config.misconfigured === false : null;
}

/** `null` means provider status was unavailable; callers should preserve last-known-good. */
export async function checkVercelProjectDomain(
  vercelProjectIdOrName: string,
  domain: string,
): Promise<boolean | null> {
  const hostname = normalizeDomainHostname(domain);
  if (!hostname) return false;
  const token = getVercelToken();
  const teamId = getVercelTeamId();
  const endpoint = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(vercelProjectIdOrName)}/domains`,
  );
  if (teamId) endpoint.searchParams.set("teamId", teamId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  try {
    const response = await fetch(endpoint.toString(), { headers });
    if (!response.ok) return null;
    const payload = asJsonObject(await response.json().catch(() => null));
    const domains = Array.isArray(payload?.domains) ? payload.domains : [];
    const match = domains
      .map(asJsonObject)
      .find((entry) => readStringField(entry, "name")?.toLowerCase() === hostname);
    if (!match || match.verified !== true) return false;
    return isVercelDomainConfigured(hostname, teamId, headers);
  } catch {
    return null;
  }
}

/**
 * Ensure the generated site's project exists before files are built/deployed.
 * This lets the exact branded domain be verified first, so SEO never points at
 * an alias that failed provisioning.
 */
export async function ensureVercelProject(
  projectName: string,
  expectedProjectId?: string | null,
): Promise<EnsuredVercelProject> {
  const name = sanitizeVercelProjectName(projectName);
  const token = getVercelToken();
  const teamId = getVercelTeamId();
  const endpoint = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(expectedProjectId?.trim() || name)}`,
  );
  if (teamId) endpoint.searchParams.set("teamId", teamId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const existing = await fetch(endpoint.toString(), { headers });
  const existingPayload = await existing.json().catch(() => null);
  if (existing.ok) {
    const root = asJsonObject(existingPayload);
    const id = readStringField(root, "id");
    if (!id) throw new Error("Vercel project response missing id");
    if (expectedProjectId?.trim() && id !== expectedProjectId.trim()) {
      throw new Error("Persisted Vercel project ownership mismatch");
    }
    return { id, name: readStringField(root, "name") ?? name };
  }
  if (existing.status !== 404) {
    throw new Error(
      extractVercelErrorMessage(existingPayload) ??
        `Vercel project lookup failed (HTTP ${existing.status})`,
    );
  }
  if (expectedProjectId?.trim()) {
    throw new Error("The persisted Vercel project no longer exists");
  }

  const createEndpoint = new URL("https://api.vercel.com/v10/projects");
  if (teamId) createEndpoint.searchParams.set("teamId", teamId);
  const created = await fetch(createEndpoint.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ name, framework: "nextjs" }),
  });
  const createdPayload = await created.json().catch(() => null);
  if (created.status === 409) {
    // Parallel first publishes can both observe 404. The deterministic project
    // name means the loser should re-read and reuse the winner, not fail or
    // create a second target.
    const raced = await fetch(endpoint.toString(), { headers });
    const racedPayload = await raced.json().catch(() => null);
    if (raced.ok) {
      const racedRoot = asJsonObject(racedPayload);
      const racedId = readStringField(racedRoot, "id");
      if (racedId) {
        return {
          id: racedId,
          name: readStringField(racedRoot, "name") ?? name,
        };
      }
    }
  }
  if (!created.ok) {
    throw new Error(
      extractVercelErrorMessage(createdPayload) ??
        `Vercel project creation failed (HTTP ${created.status})`,
    );
  }
  const root = asJsonObject(createdPayload);
  const id = readStringField(root, "id");
  if (!id) throw new Error("Vercel project creation response missing id");
  return { id, name: readStringField(root, "name") ?? name };
}

/**
 * A3 — best-effort hämtning av Vercel build-loggtext för ett failat bygge, så
 * repair-loopen får riktig felkontext i stället för bara "bygget failade".
 *
 * ALDRIG blockerande: kort AbortController-timeout, sväljer alla fel och
 * returnerar `null` när loggen inte kan hämtas (anroparen faller då tillbaka på
 * den feltext som redan finns). Läser build-event-strömmen (`?builds=1`) och
 * plockar de sista raderna med text — de innehåller normalt själva byggfelet.
 */
export async function getVercelDeploymentBuildLogText(
  vercelDeploymentId: string,
  options?: { timeoutMs?: number; maxChars?: number },
): Promise<string | null> {
  if (!vercelDeploymentId || vercelDeploymentId.trim().length === 0) return null;
  const timeoutMs = options?.timeoutMs ?? 4000;
  const maxChars = options?.maxChars ?? 4000;

  let token: string;
  try {
    token = getVercelToken();
  } catch {
    return null;
  }
  const teamId = getVercelTeamId();

  const url = new URL(
    `https://api.vercel.com/v3/deployments/${encodeURIComponent(vercelDeploymentId)}/events`,
  );
  if (teamId) url.searchParams.set("teamId", teamId);
  url.searchParams.set("builds", "1");
  url.searchParams.set("direction", "backward");
  url.searchParams.set("limit", "100");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const lines = extractBuildLogLines(raw);
    if (lines.length === 0) return null;
    const joined = lines.join("\n").trim();
    if (!joined) return null;
    // Behåll slutet (byggfelet ligger sist) om texten är lång.
    return joined.length > maxChars ? `…${joined.slice(joined.length - maxChars)}` : joined;
  } catch {
    // timeout / nätverk / parse — best-effort, faller tillbaka på befintlig text
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Plocka logg-textrader ur Vercels event-svar. Formatet varierar (JSON-array
 * eller NDJSON), så vi tolererar båda och extraherar `payload.text`/`text`.
 */
function extractBuildLogLines(raw: string): string[] {
  const out: string[] = [];
  const pushFrom = (entry: unknown) => {
    const obj = asJsonObject(entry);
    if (!obj) return;
    const payload = asJsonObject(obj.payload);
    const text = readStringField(payload, "text") ?? readStringField(obj, "text");
    if (text && text.trim()) out.push(text.replace(/\s+$/, ""));
  };

  const trimmed = raw.trim();
  if (!trimmed) return out;

  // Försök JSON-array först.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) pushFrom(entry);
      return out;
    }
    pushFrom(parsed);
    if (out.length > 0) return out;
  } catch {
    // Inte en enda JSON — fall igenom till NDJSON.
  }

  // NDJSON: en JSON per rad.
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      pushFrom(JSON.parse(t));
    } catch {
      /* tolerera trasig rad */
    }
  }
  return out;
}

export function mapVercelReadyStateToStatus(readyState: string | null): {
  status: "pending" | "building" | "ready" | "error" | "cancelled";
} {
  const s = (readyState || "").toUpperCase();
  if (s === "READY") return { status: "ready" };
  if (s === "ERROR") return { status: "error" };
  if (s === "CANCELED" || s === "CANCELLED") return { status: "cancelled" };
  if (s === "QUEUED" || s === "BUILDING" || s === "INITIALIZING") return { status: "building" };
  return { status: "pending" };
}
