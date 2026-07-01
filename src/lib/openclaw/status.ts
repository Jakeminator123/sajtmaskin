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
  /** OC_DEBUG gate (production-safeguarded). Lets the client unlock the armed
   * autonomy / debug surfaces. Not a blocker for the normal surface. */
  debugEnabled: boolean;
  /** OPENCLAW_EDIT_AGENT master flag. When true (and the surface is enabled) the
   * widget may offer prompt-driven editing that hits POST /api/openclaw/edit.
   * Not a blocker for the normal surface. Default false. */
  editAgentEnabled: boolean;
}

export interface OpenClawGatewayHealth extends OpenClawSurfaceSnapshot {
  status: "ok" | "unconfigured" | "unhealthy" | "unreachable";
  upstream?: number;
  error?: string;
}

export function describeOpenClawSurface(input: {
  gatewayConfigured: boolean;
  gatewayTokenConfigured: boolean;
  implementationFlagEnabled: boolean;
  debugEnabled?: boolean;
  editAgentEnabled?: boolean;
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
    editAgentEnabled: input.editAgentEnabled === true,
  };
}

export function getOpenClawSurfaceStatus(): OpenClawSurfaceSnapshot {
  return describeOpenClawSurface({
    gatewayConfigured: OPENCLAW.enabled,
    gatewayTokenConfigured: OPENCLAW.tokenConfigured,
    implementationFlagEnabled: OPENCLAW.implementationFlagEnabled,
    debugEnabled: OPENCLAW.debugEnabled,
    editAgentEnabled: OPENCLAW.editAgentEnabled,
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
        upstream: res.status,
      };
    }

    return {
      ...surface,
      status: "ok",
    };
  } catch (error) {
    return {
      ...surface,
      status: "unreachable",
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
