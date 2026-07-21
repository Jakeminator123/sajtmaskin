/**
 * M#818-2 F3 env-readiness gate phase of the follow-up stream handler.
 * Extracted verbatim from `chat-message-stream-post.ts`.
 */
import { NextResponse } from "next/server";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { readF3ApprovedFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import type { CodeFile } from "@/lib/gen/parser";
import { resolveChatPreferredVersionId } from "@/lib/gen/version-manager";
import { checkTier3ReadinessForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  hasRequiredRealBuildKeys,
  type Tier3BuildSpec,
} from "@/lib/integrations/tier3-build-spec";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import { approveRoundNeedsDossierInjection } from "./f3-approve-round";
import type { F3ContinuationDecision } from "./f3-continuation-phase";

/**
 * M#818-2: F3 env-readiness gate. `/finalize-design` is the intended F3
 * entry point and refuses to hand out `lifecycleStage: "integrations"`
 * stream-meta until every required real env key is present (412) — but
 * this route trusted the meta blindly, so a client that skipped
 * finalize-design started F3 codegen with placeholder keys and burned
 * credits on a generation whose build gate was guaranteed to fail.
 * Re-check the same shared gate here (server-authoritative), scoped to
 * the parent F2 version being forked (fall back to the chat's preferred
 * version when the meta omits it). Gate errors fail closed: without an
 * inspected F2 base we cannot decide between deterministic ReleaseGate
 * and a real F3 LLM build. The file-derived build spec captured on a
 * successful gate is threaded to the generation's dynamic context so the
 * F3 build plan reflects the parent version's real integrations.
 *
 * Returns an early Response on every gated/refused path, otherwise the
 * file-derived Tier-3 build spec (or `null`) for the generation.
 */
export async function runF3ReadinessGate(params: {
  chatId: string;
  message: string;
  engineChat: ChatWithMessages;
  parsedMeta: ParsedChatRequestMeta;
  metaPlanMode: boolean;
  metaEngineBaseVersionId: string | null;
  f3ContinuationDecision: F3ContinuationDecision | null;
  previousFiles: CodeFile[];
  attachSessionCookie: (response: Response) => Response;
}): Promise<Response | { fileDerivedTier3BuildSpec: Tier3BuildSpec | null }> {
  const {
    chatId,
    message,
    engineChat,
    parsedMeta,
    metaPlanMode,
    metaEngineBaseVersionId,
    f3ContinuationDecision,
    previousFiles,
    attachSessionCookie,
  } = params;
  let fileDerivedTier3BuildSpec: Tier3BuildSpec | null = null;
  if (parsedMeta.lifecycleStage === "integrations" && !metaPlanMode) {
    // Codex P1 (PR #351): the readiness gate must inspect the version the
    // generation will ACTUALLY build from — `engineBaseVersionId` drives
    // the file context (`resolveFollowUpPreviousFiles`), while
    // `parentVersionId` is only persisted as lineage. A caller that sends
    // both with different ids could point `parentVersionId` at a
    // no-integration version to sneak past the gate, so a mismatched pair
    // is refused outright (the legit F3 trigger sends them equal —
    // BuilderShellContent.tsx).
    if (
      metaEngineBaseVersionId &&
      parsedMeta.parentVersionId &&
      metaEngineBaseVersionId !== parsedMeta.parentVersionId
    ) {
      return attachSessionCookie(
        NextResponse.json(
          {
            error: "f3_base_mismatch",
            message:
              "F3-start kräver att engineBaseVersionId och parentVersionId pekar på samma F2-version.",
            engineBaseVersionId: metaEngineBaseVersionId,
            parentVersionId: parsedMeta.parentVersionId,
          },
          { status: 409 },
        ),
      );
    }
    try {
      // Chat-scope the client-supplied id (mirrors
      // `resolveFollowUpPreviousFiles`): an id that does not belong to
      // this chat falls back to the chat's preferred version — the same
      // base the generation itself would fall back to.
      //
      // Post-#351 hardening: the gate id derives from
      // `engineBaseVersionId` ONLY. `parentVersionId` is persisted
      // lineage and never feeds `resolveFollowUpPreviousFiles`, so a
      // caller sending only `parentVersionId` would previously be gated
      // against a version the generation does not build from (it builds
      // from preferred/latest in that case) — the same
      // gate-vs-build-base split the mismatch 409 above refuses.
      const requestedGateVersionId = metaEngineBaseVersionId ?? null;
      let gateVersionId: string | null = null;
      if (requestedGateVersionId) {
        const gateVersion = await chatRepo.getVersionById(requestedGateVersionId);
        if (!gateVersion || gateVersion.chat_id !== engineChat.id) {
          return attachSessionCookie(
            NextResponse.json(
              {
                error: "f3_base_version_not_found",
                ready: false,
                parentVersionId: requestedGateVersionId,
                message:
                  "Den explicit valda F2-basversionen finns inte i den här chatten.",
              },
              { status: 404 },
            ),
          );
        }
        gateVersionId = gateVersion.id;
      }
      gateVersionId =
        gateVersionId ?? (await resolveChatPreferredVersionId(engineChat.id));
      if (!gateVersionId) {
        return attachSessionCookie(
          NextResponse.json(
            {
              error: "f3_base_version_unavailable",
              ready: false,
              message:
                "Ingen tenant-säkrad F2-basversion kunde hittas för F3-kontrollen.",
            },
            { status: 409 },
          ),
        );
      }
      if (gateVersionId) {
        const pendingApprovedProviderKeys =
          f3ContinuationDecision?.replyIntent === "approve"
            ? (() => {
                const persistedApproved = readF3ApprovedFromSnapshot(
                  (engineChat.orchestration_snapshot as Record<string, unknown> | null) ??
                    null,
                );
                const markerProviders = f3ContinuationDecision.markerSuggestedProviders;
                return markerProviders.length > 0
                  ? markerProviders
                  : persistedApproved.providers;
              })()
            : [];
        // Dossier scoping (snapshot ∪ version-presence) resolves inside
        // the gate — one owner shared with the readiness/dossiers routes.
        const gate = await checkTier3ReadinessForVersion({
          versionId: gateVersionId,
          orchestrationSnapshot: engineChat.orchestration_snapshot,
          projectId: engineChat.project_id ?? null,
          pendingApprovedProviderKeys,
        });
        if (!gate.ok && gate.reason === "missing_env") {
          debugLog("orchestration", "F3 stream gated on env readiness (412)", {
            chatId,
            versionId: gateVersionId,
            missingByIntegration: gate.readiness.missingByIntegration,
          });
          return attachSessionCookie(
            NextResponse.json(
              {
                error: "tier3_env_not_ready",
                ready: false,
                parentVersionId: gateVersionId,
                projectId: engineChat.project_id ?? null,
                missingByIntegration: gate.readiness.missingByIntegration,
                message:
                  "Tunga integrationer kräver riktiga env-variabler innan F3 kan köras. Kör 'Bygg integrationer' via finalize-design.",
              },
              { status: 412 },
            ),
          );
        }
        if (!gate.ok && gate.reason === "product_postcheck_blocked") {
          // Codex P1 round 5 (#353): the Product Postcheck block must
          // hold on BOTH F3 entry points — build/lint gates cannot catch
          // DOM product failures (dead mobile menu, broken anchors).
          return attachSessionCookie(
            NextResponse.json(
              {
                error: "product_postcheck_blocked",
                ready: false,
                parentVersionId: gateVersionId,
                message:
                  "Integrationsbygget är spärrat av Product Postcheck. Åtgärda blockerande F2-previewproblem innan du bygger integrationer.",
              },
              { status: 409 },
            ),
          );
        }
        if (!gate.ok) {
          return attachSessionCookie(
            NextResponse.json(
              {
                error: "version_files_unavailable",
                ready: false,
                parentVersionId: gateVersionId,
                message:
                  "Kunde inte läsa versionens filer — kan inte avgöra F3-readiness. Ladda om och försök igen.",
              },
              { status: 409 },
            ),
          );
        }
        fileDerivedTier3BuildSpec =
          gate.spec.requirements.length > 0 ? gate.spec : null;
        if (!hasRequiredRealBuildKeys(gate.spec)) {
          // BB#f3det1: an approve-continuation whose approved providers
          // still need dossier injection (their dossier files are NOT
          // already present in the parent version) must run the real LLM
          // build round — that is how F3 "installs dormant but real
          // integration code" even when no real build keys are required.
          // The #493 deterministic policy still governs a no-build-key
          // parent WITHOUT new providers (the accepted normal case).
          // `previousFiles` and `gateVersionId` resolve from the SAME
          // explicit `engineBaseVersionId` (or the same preferred
          // fallback). The only divergence window is an explicit base
          // whose stored files parse EMPTY — and that case never reaches
          // this block: the gate above already answered 409
          // `version_files_unavailable` for an unreadable base (Bugbot
          // on #503, dismissed with this invariant).
          const approveNeedsDossierInjection =
            f3ContinuationDecision?.replyIntent === "approve" &&
            approveRoundNeedsDossierInjection({
              markerSuggestedProviders:
                f3ContinuationDecision.markerSuggestedProviders,
              snapshot:
                (engineChat.orchestration_snapshot as
                  | Record<string, unknown>
                  | null) ?? null,
              parentFilePaths: previousFiles.map((file) => file.path),
              parentSpecProviderKeys: new Set(
                gate.spec.requirements.map((requirement) =>
                  requirement.key.toLowerCase(),
                ),
              ),
            });
          if (approveNeedsDossierInjection) {
            // Fall through to the LLM build round. The marker is consumed
            // at the Phase B persistence boundary like any approve round,
            // so an aborted pre-check leaves it pending for a retry.
            devLogAppend("in-progress", {
              type: "f3.deterministic_release_exempted",
              chatId,
              reason: "approve_needs_dossier_injection",
              parentVersionId: gateVersionId,
            });
            debugLog(
              "orchestration",
              "F3 approve-continuation exempts deterministic release (dossier injection required)",
              { chatId, parentVersionId: gateVersionId },
            );
          } else {
            // Server-side backstop for the accepted deterministic F3
            // policy. The intended client path receives this action from
            // finalize-design, which creates an exact-file integrations
            // fork before the client invokes ReleaseGate on that F3 row.
            // A stale/custom client must not spend credits on a general
            // LLM round. An approval marker is consumed here because this
            // early handoff returns before the normal Phase B boundary.
            if (f3ContinuationDecision?.replyIntent === "approve") {
              // BB#f3det2: consume the marker BEFORE persisting the user
              // row so a lost race returns 409 without leaving an orphan
              // user message (a retry would otherwise double-write it).
              if (f3ContinuationDecision.markerMessageId) {
                const consumed =
                  await chatRepo.consumeF3ContinuationMarker(
                    engineChat.id,
                    f3ContinuationDecision.markerMessageId,
                  );
                if (!consumed) {
                  return attachSessionCookie(
                    NextResponse.json(
                      {
                        error: "f3_continuation_race_lost",
                        ready: false,
                        message:
                          "F3-förslaget hanterades redan av en annan förfrågan. Ladda om versionerna.",
                      },
                      { status: 409 },
                    ),
                  );
                }
              }
              // Codex P2 (#503): the marker is already consumed at this
              // point. If the user-row insert fails transiently we must
              // STILL return the deterministic-release action — throwing
              // here would leave the approval unretryable (consumed
              // marker, no pending F3 dialog). A missing chat row is
              // minor data-quality; a dead-ended approval is not.
              await chatRepo
                .addMessage(engineChat.id, "user", message)
                .catch((persistErr) => {
                  debugLog(
                    "orchestration",
                    "F3 deterministic approve: user-row persist failed after consume (continuing)",
                    {
                      chatId,
                      error:
                        persistErr instanceof Error
                          ? persistErr.message
                          : String(persistErr),
                    },
                  );
                });
            }
            return attachSessionCookie(
              NextResponse.json(
                {
                  error: "f3_deterministic_release_required",
                  ready: false,
                  action: "deterministic_release",
                  parentVersionId: gateVersionId,
                  message:
                    "Inga riktiga build-nycklar krävs. Skapa en exakt F3-fork via finalize-design och kör ReleaseGate utan LLM-generering.",
                },
                { status: 409 },
              ),
            );
          }
        }
      }
    } catch (gateErr) {
      debugLog("orchestration", "F3 stream readiness gate errored — failing closed", {
        chatId,
        error: gateErr instanceof Error ? gateErr.message : String(gateErr),
      });
      return attachSessionCookie(
        NextResponse.json(
          {
            error: "tier3_readiness_unavailable",
            ready: false,
            message:
              "F3-readiness kunde inte verifieras. Ladda om och försök igen.",
          },
          { status: 409 },
        ),
      );
    }
  }
  return { fileDerivedTier3BuildSpec };
}
