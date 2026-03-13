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
  };
}

export function getOpenClawSurfaceStatus(): OpenClawSurfaceSnapshot {
  return describeOpenClawSurface({
    gatewayConfigured: OPENCLAW.enabled,
    gatewayTokenConfigured: OPENCLAW.tokenConfigured,
    implementationFlagEnabled: OPENCLAW.implementationFlagEnabled,
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
