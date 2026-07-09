import { randomUUID } from "crypto";
import { getVercelToken } from "@/lib/vercel";

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
