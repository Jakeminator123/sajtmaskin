import { OPENCLAW } from "@/lib/config";

export type OpenClawSurfaceStatus =
  | "enabled"
  | "disabled_missing_token"
  | "disabled_missing_gateway"
  | "disabled_missing_flag"
  | "disabled_missing_gateway_and_flag";

export interface OpenClawSurfaceSnapshot {
  gatewayConfigured: boolean;
  gatewayTokenConfigured: boolean;
  implementationFlagEnabled: boolean;
  surfaceEnabled: boolean;
  surfaceStatus: OpenClawSurfaceStatus;
  blockers: string[];
  /** OC_DEBUG gate — read/diagnostics side (debug context). Not a blocker for
   * the normal surface. */
  debugEnabled: boolean;
  /** OC_EDIT gate — act side. Lets the chat OFFER extra powers (armed autonomy,
   * quick edits); the user still has to grant them in the UI before anything
   * changes (`powers.ts`). Not a blocker for the normal surface. */
  editEnabled: boolean;
}

export interface OpenClawGatewayHealth extends OpenClawSurfaceSnapshot {
  status: "ok" | "unconfigured" | "unhealthy" | "unreachable";
  readiness?: "ready" | "liveness_failed" | "auth_failed" | "invalid_models" | "missing_agents";
  upstream?: number;
  requiredAgentIds?: string[];
  missingAgentIds?: string[];
  error?: string;
}

const STRONG_AGENT_MODEL_ID = "openclaw/sajtagenten";
const ROUTED_AGENT_MODEL_IDS = [
  "openclaw/sajtagenten-balanced",
  "openclaw/sajtagenten-fast",
] as const;

export function describeOpenClawSurface(input: {
  gatewayConfigured: boolean;
  gatewayTokenConfigured: boolean;
  implementationFlagEnabled: boolean;
  debugEnabled?: boolean;
  editEnabled?: boolean;
}): OpenClawSurfaceSnapshot {
  const blockers: string[] = [];

  if (!input.gatewayConfigured) {
    blockers.push("OPENCLAW_GATEWAY_URL is not configured");
  }

  if (!input.gatewayTokenConfigured) {
    blockers.push("OPENCLAW_GATEWAY_TOKEN is not configured");
  }

  if (!input.implementationFlagEnabled) {
    blockers.push("IMPLEMENT_UNDERSCORE_CLAW is not enabled");
  }

  let surfaceStatus: OpenClawSurfaceStatus;
  if (input.gatewayConfigured && input.gatewayTokenConfigured && input.implementationFlagEnabled) {
    surfaceStatus = "enabled";
  } else if (!input.gatewayConfigured && !input.implementationFlagEnabled) {
    surfaceStatus = "disabled_missing_gateway_and_flag";
  } else if (!input.gatewayConfigured) {
    surfaceStatus = "disabled_missing_gateway";
  } else if (!input.gatewayTokenConfigured) {
    surfaceStatus = "disabled_missing_token";
  } else {
    surfaceStatus = "disabled_missing_flag";
  }

  return {
    gatewayConfigured: input.gatewayConfigured,
    gatewayTokenConfigured: input.gatewayTokenConfigured,
    implementationFlagEnabled: input.implementationFlagEnabled,
    surfaceEnabled: blockers.length === 0,
    surfaceStatus,
    blockers,
    debugEnabled: input.debugEnabled === true,
    editEnabled: input.editEnabled === true,
  };
}

export function getOpenClawSurfaceStatus(): OpenClawSurfaceSnapshot {
  return describeOpenClawSurface({
    gatewayConfigured: OPENCLAW.enabled,
    gatewayTokenConfigured: OPENCLAW.tokenConfigured,
    implementationFlagEnabled: OPENCLAW.implementationFlagEnabled,
    debugEnabled: OPENCLAW.debugEnabled,
    editEnabled: OPENCLAW.editEnabled,
  });
}

export async function checkOpenClawGatewayHealth(
  timeoutMs = 5_000,
): Promise<OpenClawGatewayHealth> {
  const surface = getOpenClawSurfaceStatus();

  if (!surface.gatewayConfigured) {
    return {
      ...surface,
      status: "unconfigured",
      error: "OPENCLAW_GATEWAY_URL not set",
    };
  }

  try {
    const res = await fetch(`${OPENCLAW.gatewayUrl}/health`, {
      headers: OPENCLAW.gatewayToken
        ? { Authorization: `Bearer ${OPENCLAW.gatewayToken}` }
        : {},
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        ...surface,
        status: "unhealthy",
        readiness: "liveness_failed",
        upstream: res.status,
      };
    }

    const requiredAgentIds = [
      STRONG_AGENT_MODEL_ID,
      ...(OPENCLAW.modelRoutingEnabled ? ROUTED_AGENT_MODEL_IDS : []),
    ];
    const modelsRes = await fetch(`${OPENCLAW.gatewayUrl}/v1/models`, {
      headers: OPENCLAW.gatewayToken
        ? { Authorization: `Bearer ${OPENCLAW.gatewayToken}` }
        : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!modelsRes.ok) {
      return {
        ...surface,
        status: "unhealthy",
        readiness: "auth_failed",
        upstream: modelsRes.status,
        requiredAgentIds,
        error: "Authenticated gateway readiness check failed",
      };
    }

    const payload = (await modelsRes.json().catch(() => null)) as
      | { data?: Array<{ id?: unknown }> }
      | null;
    if (!payload || !Array.isArray(payload.data)) {
      return {
        ...surface,
        status: "unhealthy",
        readiness: "invalid_models",
        requiredAgentIds,
        error: "Gateway model list was invalid",
      };
    }

    const available = new Set(
      payload.data
        .map((entry) => (typeof entry?.id === "string" ? entry.id : ""))
        .filter(Boolean),
    );
    const missingAgentIds = requiredAgentIds.filter((id) => !available.has(id));
    if (missingAgentIds.length > 0) {
      return {
        ...surface,
        status: "unhealthy",
        readiness: "missing_agents",
        requiredAgentIds,
        missingAgentIds,
        error: "Required OpenClaw agents are missing",
      };
    }

    return {
      ...surface,
      status: "ok",
      readiness: "ready",
      requiredAgentIds,
      missingAgentIds: [],
    };
  } catch (error) {
    return {
      ...surface,
      status: "unreachable",
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
