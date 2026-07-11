import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS } from "@/lib/gen/verify/quality-gate-checks";

export type F3RequirementSummary = {
  key: string;
  name: string;
  requiredRealEnvKeys: string[];
};

type MissingEnvEntry = {
  key: string;
  name: string;
  missing: string[];
};

export type F3FinalizeActionResult =
  | {
      kind: "llm_ready";
      parentVersionId: string;
      requirements: F3RequirementSummary[];
    }
  | {
      kind: "missing_env";
      parentVersionId: string;
      projectId: string | null;
      missingByIntegration: MissingEnvEntry[];
    }
  | {
      kind: "deterministic_release";
      ok: boolean;
      parentVersionId: string;
      versionId: string;
      alreadyPromoted: boolean;
      passed: boolean;
      promoted: boolean;
      vmGatePassed: boolean | null;
      superseded: boolean;
      promoteError: boolean;
      promotionBlocked: boolean;
      retryable: boolean;
      code: string | null;
      message: string | null;
      failedChecks: string[];
      status: number;
    }
  | {
      kind: "error";
      status: number;
      code: string | null;
      reason: string | null;
      message: string;
      retryable: boolean;
    };

type FinalizeResponse = {
  ready?: boolean;
  action?: "deterministic_release";
  reason?: string;
  error?: string;
  message?: string;
  parentVersionId?: string;
  projectId?: string | null;
  versionId?: string;
  gateRequired?: boolean;
  releaseState?: string;
  verificationState?: string;
  requirements?: F3RequirementSummary[];
  missingByIntegration?: MissingEnvEntry[];
};

type ReleaseGateResponse = {
  passed?: boolean;
  promoted?: boolean;
  vmGatePassed?: boolean;
  superseded?: boolean;
  promoteError?: boolean;
  promotionBlocked?: boolean;
  retryable?: boolean;
  code?: string;
  error?: string;
  projectId?: string | null;
  missingByIntegration?: MissingEnvEntry[];
  checks?: Array<{ check?: string; passed?: boolean }>;
};

function errorResult(params: {
  status: number;
  payload: FinalizeResponse | ReleaseGateResponse | null;
  fallback: string;
}): Extract<F3FinalizeActionResult, { kind: "error" }> {
  const { status, payload, fallback } = params;
  const raw = (payload ?? {}) as Record<string, unknown>;
  const code =
    typeof raw.code === "string"
      ? raw.code
      : typeof raw.reason === "string"
        ? raw.reason
        : null;
  const message =
    typeof raw.error === "string"
      ? raw.error
      : typeof raw.message === "string"
        ? raw.message
        : fallback;
  return {
    kind: "error",
    status,
    code,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    message,
    retryable:
      (payload as ReleaseGateResponse | null)?.retryable === true ||
      status === 503 ||
      code === "version_busy",
  };
}

/**
 * Canonical client action for the F3 button and the stale-client stream
 * backstop. Finalize-design decides LLM vs deterministic policy; only the
 * deterministic branch invokes the existing ReleaseGate route.
 */
export async function runF3FinalizeAction(params: {
  chatId: string;
  parentVersionId: string;
  onDeterministicReleaseStarted?: (versionId: string) => void;
}): Promise<F3FinalizeActionResult> {
  try {
    const finalizeResponse = await fetch(
      `${engineChatBaseUrl(params.chatId)}/finalize-design`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: params.parentVersionId }),
      },
    );
    const finalize = (await finalizeResponse.json().catch(() => null)) as
      | FinalizeResponse
      | null;

    if (
      finalizeResponse.status === 412 &&
      typeof finalize?.parentVersionId === "string"
    ) {
      return {
        kind: "missing_env",
        parentVersionId: finalize.parentVersionId,
        projectId:
          typeof finalize.projectId === "string" ? finalize.projectId : null,
        missingByIntegration: finalize.missingByIntegration ?? [],
      };
    }
    if (
      !finalizeResponse.ok ||
      finalize?.ready !== true ||
      typeof finalize.parentVersionId !== "string"
    ) {
      return errorResult({
        status: finalizeResponse.status,
        payload: finalize,
        fallback: "Kunde inte förbereda F3.",
      });
    }

    if (finalize.action !== "deterministic_release") {
      return {
        kind: "llm_ready",
        parentVersionId: finalize.parentVersionId,
        requirements: finalize.requirements ?? [],
      };
    }
    if (typeof finalize.versionId !== "string" || !finalize.versionId.trim()) {
      return {
        kind: "error",
        status: 500,
        code: "deterministic_f3_version_missing",
        reason: null,
        message: "F3-forken saknar versionId.",
        retryable: true,
      };
    }

    const alreadyPromoted =
      finalize.gateRequired === false &&
      finalize.releaseState === "promoted" &&
      finalize.verificationState === "passed";
    if (alreadyPromoted) {
      return {
        kind: "deterministic_release",
        ok: true,
        parentVersionId: finalize.parentVersionId,
        versionId: finalize.versionId,
        alreadyPromoted: true,
        passed: true,
        promoted: true,
        vmGatePassed: true,
        superseded: false,
        promoteError: false,
        promotionBlocked: false,
        retryable: false,
        code: null,
        message: finalize.message ?? null,
        failedChecks: [],
        status: 200,
      };
    }

    params.onDeterministicReleaseStarted?.(finalize.versionId);
    let gateResponse: Response;
    try {
      gateResponse = await fetch(
        `${engineChatBaseUrl(params.chatId)}/quality-gate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: finalize.versionId,
            gate: "integrationsBuild",
            checks: INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
          }),
        },
      );
    } catch (error) {
      return {
        kind: "deterministic_release",
        ok: false,
        parentVersionId: finalize.parentVersionId,
        versionId: finalize.versionId,
        alreadyPromoted: false,
        passed: false,
        promoted: false,
        vmGatePassed: null,
        superseded: false,
        promoteError: true,
        promotionBlocked: false,
        retryable: true,
        code: "network_error",
        message: error instanceof Error ? error.message : "ReleaseGate network error",
        failedChecks: [],
        status: 0,
      };
    }
    const gate = (await gateResponse.json().catch(() => null)) as
      | ReleaseGateResponse
      | null;
    if (
      gateResponse.status === 412 &&
      gate?.error === "tier3_env_not_ready"
    ) {
      return {
        kind: "missing_env",
        parentVersionId: finalize.parentVersionId,
        projectId: typeof gate.projectId === "string" ? gate.projectId : null,
        missingByIntegration: gate.missingByIntegration ?? [],
      };
    }
    const failedChecks = (gate?.checks ?? [])
      .filter((check) => check.passed === false && typeof check.check === "string")
      .map((check) => check.check as string);
    const vmGatePassed =
      typeof gate?.vmGatePassed === "boolean" ? gate.vmGatePassed : null;
    const superseded = gate?.superseded === true;
    const promoteError = gate?.promoteError === true;
    const promotionBlocked = gate?.promotionBlocked === true;
    const promoted = gate?.promoted === true;
    const passed = gate?.passed === true;
    const ok =
      gateResponse.ok &&
      passed &&
      promoted &&
      vmGatePassed !== false &&
      !superseded &&
      !promoteError &&
      !promotionBlocked;

    return {
      kind: "deterministic_release",
      ok,
      parentVersionId: finalize.parentVersionId,
      versionId: finalize.versionId,
      alreadyPromoted: false,
      passed,
      promoted,
      vmGatePassed,
      superseded,
      promoteError,
      promotionBlocked,
      retryable:
        gate?.retryable === true ||
        gateResponse.status === 503 ||
        gate?.code === "version_busy",
      code: typeof gate?.code === "string" ? gate.code : null,
      message:
        typeof gate?.error === "string"
          ? gate.error
          : typeof finalize.message === "string"
            ? finalize.message
            : null,
      failedChecks,
      status: gateResponse.status,
    };
  } catch (error) {
    return {
      kind: "error",
      status: 0,
      code: "network_error",
      reason: null,
      message:
        error instanceof Error
          ? error.message
          : "F3-kontrollen misslyckades på grund av ett nätverksfel.",
      retryable: true,
    };
  }
}
