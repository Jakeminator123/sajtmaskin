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

export function getVercelTeamId(): string | null {
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

  return truncated.length > 0 ? truncated : `sajtmaskin-${Date.now()}`;
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
