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
 *  - `200 OK` with the normal F3 stream metadata when a real build key is
 *    required and ready.
 *  - `200 OK` with `action: "deterministic_release"` when the selected
 *    Byggblock need no real build key — this route forks a new F3 row from the
 *    exact F2 files, and the client runs ReleaseGate on that F3 version without
 *    starting a general F3 LLM round.
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
import {
  createDraftVersion,
  getLatestVersion,
  getPreferredVersion,
  getVersionsByChat,
} from "@/lib/db/chat-repository-pg";
import {
  checkTier3ReadinessForVersion,
} from "@/lib/integrations/tier3-readiness-gate";
import { hasRequiredRealBuildKeys } from "@/lib/integrations/tier3-build-spec";

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1).optional(),
});

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
    if (parsed.data.versionId && !requestedVersion) {
      // Do not silently replace an explicit foreign/missing version id with
      // this chat's latest version. The deterministic ReleaseGate must stay
      // bound to the exact tenant-scoped F2 version the user selected.
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const preferredVersion = await getPreferredVersion(chat.id);
    const latestVersion = preferredVersion ?? (await getLatestVersion(chat.id));
    if (
      requestedVersion?.version &&
      preferredVersion &&
      preferredVersion.chat_id === chat.id &&
      preferredVersion.lifecycle_stage !== "integrations" &&
      preferredVersion.id !== requestedVersion.version.id
    ) {
      return NextResponse.json(
        {
          ready: false,
          reason: "stale_design_version",
          requestedVersionId: requestedVersion.version.id,
          latestVersionId: preferredVersion.id,
          message:
            "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
        },
        { status: 409 },
      );
    }

    const baseVersion = requestedVersion?.version ?? latestVersion;
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

    // `checkTier3ReadinessForVersion` is the shared owner used by the stream
    // route as well. It resolves snapshot ∪ version-presence, Product
    // Postcheck, and per-key build enforcement once, so the F3 entry points
    // cannot disagree about selected Byggblock or build blockers.
    let gate: Awaited<ReturnType<typeof checkTier3ReadinessForVersion>>;
    try {
      gate = await checkTier3ReadinessForVersion({
        versionId: baseVersion.id,
        orchestrationSnapshot: chat.orchestration_snapshot,
        projectId: chat.project_id,
      });
    } catch (error) {
      console.warn("[finalize-design] F3 readiness unavailable:", error);
      return NextResponse.json(
        {
          ready: false,
          reason: "version_files_unavailable",
          parentVersionId: baseVersion.id,
          message:
            "Kunde inte läsa versionens filer — kan inte avgöra F3-readiness. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    if (!gate.ok && gate.reason === "product_postcheck_blocked") {
      return NextResponse.json(
        {
          ready: false,
          reason: "product_postcheck_blocked",
          parentVersionId: baseVersion.id,
          message:
            "Integrationsbygget är spärrat av Product Postcheck. Åtgärda blockerande F2-previewproblem innan du bygger integrationer.",
        },
        { status: 409 },
      );
    }

    if (!gate.ok && gate.reason === "version_files_unavailable") {
      return NextResponse.json(
        {
          ready: false,
          reason: "version_files_unavailable",
          parentVersionId: baseVersion.id,
          message:
            "Kunde inte läsa versionens filer — kan inte avgöra F3-readiness. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    if (!gate.ok && gate.reason === "missing_env") {
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          projectId: chat.project_id,
          missingByIntegration: gate.readiness.missingByIntegration,
          requirements: gate.spec.requirements,
          message:
            "Tunga integrationer kräver riktiga env-variabler innan F3 kan köras.",
        },
        { status: 412 },
      );
    }

    if (!gate.ok) {
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          message: "Kunde inte avgöra F3-readiness. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    // A valid gate has a spec. `requiredRealEnvKeys`, rather than the presence
    // of a dossier/requirement, decides whether a new F3 LLM build is useful:
    // hard and soft Byggblock with only feature-runtime/warn-only configuration
    // keep their existing F2 visual fallback. The files are copied byte-for-byte
    // into a NEW integrations row so lifecycle/readiness/deploy semantics remain
    // F3-owned while the selected F2 row remains untouched.
    const requirements = gate.spec.requirements;
    if (!hasRequiredRealBuildKeys(gate.spec)) {
      if (typeof baseVersion.files_json !== "string" || !baseVersion.files_json.trim()) {
        return NextResponse.json(
          {
            ready: false,
            reason: "version_files_unavailable",
            parentVersionId: baseVersion.id,
            message:
              "Kunde inte läsa versionens exakta filer — kan inte skapa F3-versionen.",
          },
          { status: 409 },
        );
      }

      // Sequential retries reuse the exact same deterministic child. Comparing
      // the stored files_json guarantees this never mistakes a real LLM-built
      // F3 child for the exact-file fork.
      let f3Version: Awaited<ReturnType<typeof createDraftVersion>>;
      let existingFork: Awaited<
        ReturnType<typeof getVersionsByChat>
      >[number] | undefined;
      try {
        const exactForks = (await getVersionsByChat(chat.id)).filter(
          (version) =>
            version.lifecycle_stage === "integrations" &&
            version.parent_version_id === baseVersion.id &&
            version.files_json === baseVersion.files_json,
        );
        existingFork =
          exactForks.find(
            (version) =>
              version.release_state === "promoted" &&
              version.verification_state === "passed",
          ) ?? exactForks[0];
        f3Version =
          existingFork ??
          (await createDraftVersion(
            chat.id,
            null,
            baseVersion.files_json,
            undefined,
            {
              stage: "integrations",
              parentVersionId: baseVersion.id,
            },
          ));
      } catch (error) {
        console.warn("[finalize-design] deterministic F3 fork unavailable:", error);
        return NextResponse.json(
          {
            ready: false,
            reason: "f3_fork_unavailable",
            parentVersionId: baseVersion.id,
            message:
              "Kunde inte skapa F3-versionen just nu. Försök igen.",
          },
          { status: 409 },
        );
      }
      const alreadyPromoted =
        f3Version.release_state === "promoted" &&
        f3Version.verification_state === "passed";

      return NextResponse.json({
        ready: true,
        action: "deterministic_release",
        parentVersionId: baseVersion.id,
        versionId: f3Version.id,
        lifecycleStage: "integrations",
        gateRequired: !alreadyPromoted,
        reused: Boolean(existingFork),
        releaseState: f3Version.release_state,
        verificationState: f3Version.verification_state,
        requirements,
        message:
          alreadyPromoted
            ? "Den exakta F3-versionen är redan godkänd av ReleaseGate."
            : "Byggblocket behåller F2-filernas visuella fallback. ReleaseGate körs på en exakt F3-fork utan LLM-generering.",
      });
    }

    return NextResponse.json({
      ready: true,
      parentVersionId: baseVersion.id,
      requirements,
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
