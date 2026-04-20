/**
 * F3 trigger — "Bygg integrationer".
 *
 * Validates that the user has supplied real values for every tier-3 env
 * key required by the design version, and (when ready) returns the
 * payload the client uses to POST the regular `/stream` endpoint with
 * `meta.lifecycleStage: "integrations"` and `meta.parentVersionId`
 * pointing at the F2 version we forked from.
 *
 * Responses:
 *  - `200 OK` with `{ ready: true, parentVersionId, requirements }` —
 *    client may now call the chat-stream endpoint to run F3.
 *  - `412 Precondition Failed` with `{ ready: false, missingByIntegration }`
 *    — show the env form and have the user fill in the missing keys.
 *  - `404 Not Found` — chat or version not visible to caller.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { getLatestVersion, getPreferredVersion } from "@/lib/db/chat-repository-pg";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import {
  deriveTier3BuildSpec,
  validateTier3Readiness,
  type Tier3BuildSpec,
} from "@/lib/integrations/tier3-build-spec";
import type {
  PlanContracts,
  PlanIntegrationContract,
} from "@/lib/gen/plan/schema";

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1).optional(),
});

function buildContractsFromDetectedIntegrations(
  detected: ReturnType<typeof detectIntegrationsFromVersionFiles>,
): PlanContracts {
  const integrations: PlanIntegrationContract[] = detected
    .filter((d) => d.key !== "custom-env")
    .map((d): PlanIntegrationContract => ({
      provider: d.provider ?? d.key,
      name: d.name,
      reason: typeof d.intent === "string" ? d.intent : "detected from generated code",
      status: "chosen",
      envVars: d.envVars,
    }));
  return {
    dataMode: integrations.length > 0 ? "persisted" : "none",
    integrations,
    envVars: [],
  };
}

async function deriveTier3BuildSpecForVersion(
  versionId: string,
): Promise<Tier3BuildSpec> {
  const codeFiles = await getVersionFiles(versionId);
  if (!codeFiles || codeFiles.length === 0) {
    return { requirements: [] };
  }
  const detected = detectIntegrationsFromVersionFiles(
    codeFiles
      .filter((f) => typeof f?.path === "string" && typeof f?.content === "string")
      .map((f) => ({ name: f.path as string, content: f.content as string })),
  );
  const contracts = buildContractsFromDetectedIntegrations(detected);
  return deriveTier3BuildSpec(contracts);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const chat = await getEngineChatByIdForRequest(request, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const requestedVersion = parsed.data.versionId
      ? await getEngineVersionForChatByIdForRequest(
          request,
          chat.id,
          parsed.data.versionId,
        )
      : null;
    const baseVersion =
      requestedVersion?.version ??
      (await getPreferredVersion(chat.id)) ??
      (await getLatestVersion(chat.id));
    if (!baseVersion || baseVersion.chat_id !== chat.id) {
      return NextResponse.json(
        { error: "No design version found for this chat." },
        { status: 404 },
      );
    }

    if (baseVersion.lifecycle_stage === "integrations") {
      return NextResponse.json(
        {
          ready: false,
          reason: "already_integrations",
          message:
            "Den här versionen är redan en F3-integrationsversion. Välj F2-designversionen att forka från.",
        },
        { status: 409 },
      );
    }

    const spec = await deriveTier3BuildSpecForVersion(baseVersion.id);

    if (spec.requirements.length === 0) {
      return NextResponse.json({
        ready: true,
        parentVersionId: baseVersion.id,
        requirements: [],
        message:
          "Inga tunga integrationer detekterade. Du kan starta F3 för en strikt build/typecheck-pass.",
        streamMeta: {
          lifecycleStage: "integrations",
          parentVersionId: baseVersion.id,
        },
      });
    }

    const projectEnvVars = chat.project_id
      ? await getStoredProjectEnvVarMap(chat.project_id).catch(
          () => ({} as Record<string, string>),
        )
      : ({} as Record<string, string>);

    const readiness = validateTier3Readiness(spec, projectEnvVars);

    if (!readiness.ready) {
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          missingByIntegration: readiness.missingByIntegration,
          requirements: spec.requirements,
          message:
            "Tunga integrationer kräver riktiga env-variabler innan F3 kan köras.",
        },
        { status: 412 },
      );
    }

    return NextResponse.json({
      ready: true,
      parentVersionId: baseVersion.id,
      requirements: spec.requirements,
      streamMeta: {
        lifecycleStage: "integrations",
        parentVersionId: baseVersion.id,
      },
    });
  } catch (err) {
    console.error("[finalize-design] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
