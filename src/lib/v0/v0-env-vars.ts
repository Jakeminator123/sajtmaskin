import { v0 } from "@/lib/v0";

const SYNTHETIC_PREFIXES = ["chat:", "registry:"];

type V0ProjectsEnvClient = {
  projects?: {
    findEnvVars?: (arg: {
      projectId: string;
      decrypted?: string;
    }) => Promise<unknown>;
  };
};

export async function fetchV0ProjectEnvVars(
  v0ProjectId: string,
): Promise<Record<string, string>> {
  if (
    !v0ProjectId ||
    SYNTHETIC_PREFIXES.some((p) => v0ProjectId.startsWith(p))
  ) {
    return {};
  }

  const client = (v0 as unknown as V0ProjectsEnvClient).projects;
  if (!client?.findEnvVars) {
    return {};
  }

  const response = await client.findEnvVars({
    projectId: v0ProjectId,
    decrypted: "true",
  });

  const envVars: Record<string, string> = {};
  const raw = Array.isArray(response)
    ? response
    : response && typeof response === "object"
      ? (response as Record<string, unknown>).envVars ??
        (response as Record<string, unknown>).data ??
        (response as Record<string, unknown>).items ??
        []
      : [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const k =
        (typeof (item as Record<string, unknown>).key === "string" &&
          (item as Record<string, unknown>).key) ||
        (typeof (item as Record<string, unknown>).name === "string" &&
          (item as Record<string, unknown>).name);
      const v = (item as Record<string, unknown>).value;
      if (typeof k === "string" && typeof v === "string") {
        envVars[k] = v;
      }
    }
  }

  return envVars;
}
