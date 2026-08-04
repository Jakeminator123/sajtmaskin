import { planArtifactHasSubstance } from "@/lib/gen/plan/review";
import {
  F3_APPROVAL_NOTHING_TO_BUILD_REASON,
  F3_REJECT_ACK_REASON,
  F3_TOOL_ONLY_EXHAUSTED_REASON,
} from "@/lib/gen/stream/f3-continuation";
import { resolveCanonicalLivePreviewUrlFromDonePayload } from "@/lib/api/preview-url-contract";
import { toast } from "sonner";
import {
  appendToolPartToMessage,
  mergeUiParts,
  updateCreateChatLockChatId,
} from "./helpers";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";
import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";

type DoneDeps = {
  appendProgressPart: (
    step: string,
    phase: string,
    payload?: Record<string, unknown>,
  ) => void;
  deliverPreviewUrl: (url: string | null | undefined, versionId: string | null) => void;
  parseDonePreflight: (doneData: Record<string, unknown>) => PreviewPreflightState | null;
};

export function handleDoneEvent(
  data: unknown,
  state: StreamRunState,
  ctx: StreamContext,
  deps: DoneDeps,
) {
  state.didReceiveDone = true;
  state.streamStats.didReceiveDone = true;
  if (
    !state.generationDoneProgressReceived &&
    (state.generationProgressStarted ||
      state.accumulatedContent.trim().length > 0 ||
      state.accumulatedThinking.trim().length > 0)
  ) {
    deps.appendProgressPart("generation", "done");
  }
  const doneData =
    typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const donePreflight = deps.parseDonePreflight(doneData);
  const doneV0ProjectId =
    doneData.projectId || doneData.v0ProjectId || doneData.v0_project_id || null;
  if (doneV0ProjectId && !state.linkedProjectIdFromStream) {
    state.linkedProjectIdFromStream = String(doneV0ProjectId);
    ctx.onLinkedProjectId?.(state.linkedProjectIdFromStream);
  }
  const effectiveDoneDemo = resolveCanonicalLivePreviewUrlFromDonePayload(
    doneData as { previewUrl?: unknown; demoUrl?: unknown },
  );
  ctx.setPreviewPending?.(Boolean(doneData.previewPending));
  const resolvedChatId =
    doneData.chatId || doneData.id || state.chatIdFromStream || ctx.chatId || null;
  const resolvedVersionId =
    doneData.versionId ||
    doneData.version_id ||
    (doneData.latestVersion as Record<string, unknown> | undefined)?.id ||
    (doneData.latestVersion as Record<string, unknown> | undefined)?.versionId ||
    state.versionIdFromStream ||
    null;
  if (resolvedVersionId) {
    state.versionIdFromStream = String(resolvedVersionId);
  }
  if (effectiveDoneDemo) {
    // After versionId resolution so the dedup key matches the one
    // preview-ready used — a done that repeats the same URL for the
    // same version must not reload the iframe a second time.
    deps.deliverPreviewUrl(effectiveDoneDemo, state.versionIdFromStream);
  }
  const awaitingInput = Boolean(doneData.awaitingInput);
  // Plan-läget avslutar medvetet utan version och utan preview —
  // planen ÄR resultatet. Räknades den inte som återfunnen artefakt
  // tog empty-output-grenen nedan över och visade "Genereringen
  // avslutades utan version eller preview." med en `break`, så
  // plan-kortet aldrig monterades och "Plan skapad!" aldrig nåddes.
  // Gäller bara planer utan blockerare; med blockerare är
  // `awaitingInput` redan sant.
  //
  // Kräver substans som ÖVERLEVER normaliseringen, inte bara en
  // icke-tom array: `plan-mode-stream.ts` skickar
  // `resolvePlanArtifact(...) ?? {}` och serverns resolver berikar
  // bara ytligt, så `{ steps: [{}] }` — eller steg vars `phase` inte
  // är ett giltigt enumvärde — når hit orört. `normalizePlanArtifact`
  // släpper varje steg utan titel/beskrivning/giltig fas och varje
  // blockerare utan kind/question, men defaultar `goal` till "Plan"
  // och returnerar alltså ett objekt ändå. Räknades arraylängden
  // rått blev en misslyckad planering "Plan skapad!" plus ett tomt
  // kort — falsk grönt. Detta är samma normalisering som
  // `BuildPlanCard` renderar ur, så toasten och kortet kan inte säga
  // emot varandra. Substanspredikatet delas med serverns
  // persist-beslut (`planArtifactHasSubstance` räknar även
  // pages/scope — en sidplan utan steg är en riktig plan), så
  // klientens toast kan inte säga emot vad servern sparade.
  const hasPlanArtifact = planArtifactHasSubstance(
    (doneData.planArtifact ?? null) as Record<string, unknown> | null,
  );
  const hasRecoveredArtifact =
    awaitingInput ||
    Boolean(resolvedVersionId) ||
    Boolean(effectiveDoneDemo) ||
    hasPlanArtifact;
  state.recoveredArtifactSignal = hasRecoveredArtifact;
  const emptyGenerationReason =
    typeof doneData.reason === "string" && doneData.reason.trim().length > 0
      ? doneData.reason.trim()
      : "no_version_or_preview";
  
  if (!resolvedChatId) {
    throw new Error("No chat ID returned from stream");
  }
  if (state.pendingStreamErrorMessage && !hasRecoveredArtifact) {
    throw new Error(state.pendingStreamErrorMessage);
  }
  // P2 F3-loop: deliberate no-version close-outs (calm F3 reject,
  // loop-breaker terminal close). The server already streamed the
  // explanation as content — finalize the assistant message
  // without the "generation ended without version" failure toast.
  const isCalmNoVersionClose =
    emptyGenerationReason === F3_REJECT_ACK_REASON ||
    emptyGenerationReason === F3_APPROVAL_NOTHING_TO_BUILD_REASON ||
    emptyGenerationReason === F3_TOOL_ONLY_EXHAUSTED_REASON;
  const nextId = String(resolvedChatId);
  state.streamStats.chatId = nextId;
  state.streamStats.versionId = resolvedVersionId ? String(resolvedVersionId) : null;
  
  if (!state.chatIdFromStream && ctx.setChatId) {
    state.chatIdFromStream = nextId;
    ctx.setChatId(nextId);
    if (ctx.chatIdParam !== nextId && ctx.buildBuilderParams && ctx.router) {
      const params = ctx.buildBuilderParams({
        chatId: nextId,
        project: ctx.appProjectId ?? undefined,
      });
      ctx.router.replace(`/builder?${params.toString()}`);
    }
  }
  if (ctx.pendingCreateKeyRef?.current) {
    updateCreateChatLockChatId(ctx.pendingCreateKeyRef.current, nextId);
  }
  
  if (!awaitingInput && !hasRecoveredArtifact && isCalmNoVersionClose) {
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId ? { ...m, isStreaming: false } : m,
      ),
    );
    return;
  }
  
  if (!awaitingInput && !hasRecoveredArtifact) {
    // Strömmad assistenttext som nådde chatten är inte "ingenting":
    // när innehåll finns (eller servern uttryckligen sa
    // `stream_ended_without_version`) får varken feltoasten eller
    // empty-output-fasen påstå att inget kom tillbaka. Medvetet
    // INTE inbakat i `hasRecoveredArtifact` — den signalen betyder
    // "riktig artefakt" och styr bl.a. Byggval-reset i
    // useCreateChat, där strömmad text utan version inte ska räknas.
    const hasStreamedContent =
      state.accumulatedContent.trim().length > 0 ||
      emptyGenerationReason === "stream_ended_without_version";
    if (hasStreamedContent) {
      if (doneData.planMode === true) {
        // Plan-läge utan substansplan: servern persisterar prosan
        // som planner-text — ett medvetet utfall, inte ett
        // persist-fel. Ingen codegen-fas ("kunde inte sparas som
        // version" vore lögn) och ingen toast; texten är
        // resultatet. Completion-hooken körs som på den lyckade
        // planvägen så UI:t inte fastnar i genererings-läge.
        ctx.setMessages((prev) =>
          prev.map((m) =>
            m.id === ctx.assistantMessageId ? { ...m, isStreaming: false } : m,
          ),
        );
        ctx.onGenerationComplete?.({ chatId: nextId });
        return;
      }
      deps.appendProgressPart("generation", "stream-without-version", {
        reason: emptyGenerationReason,
      });
      ctx.setMessages((prev) =>
        prev.map((m) =>
          m.id === ctx.assistantMessageId ? { ...m, isStreaming: false } : m,
        ),
      );
      return;
    }
    deps.appendProgressPart("generation", "empty-output", { reason: emptyGenerationReason });
    const explicitFailureMessage =
      state.pendingStreamErrorMessage ||
      (emptyGenerationReason.includes("empty_output")
        ? "Own-engine genererade ingen användbar kod i det här försöket."
        : "Genereringen avslutades utan version eller preview.");
    ctx.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== ctx.assistantMessageId) return m;
        if ((m.content || "").trim().length > 0) {
          return { ...m, isStreaming: false };
        }
        return {
          ...m,
          content: `${explicitFailureMessage} Försök igen eller justera prompten.`,
          isStreaming: false,
        };
      }),
    );
    toast.error(explicitFailureMessage);
    return;
  }
  
  if (awaitingInput) {
    const planBlockers = (() => {
      const pa = doneData.planArtifact as Record<string, unknown> | undefined;
      if (!pa || !Array.isArray(pa.blockers)) return null;
      const arr = pa.blockers as Array<Record<string, unknown>>;
      return arr.length > 0 ? arr : null;
    })();
  
    const serverAwaitingPrompt =
      typeof doneData.awaitingInputPrompt === "string"
        ? doneData.awaitingInputPrompt.trim()
        : "";
    const questionPreview = (() => {
      if (serverAwaitingPrompt) return serverAwaitingPrompt;
      if (planBlockers) {
        return planBlockers
          .map((b) => String(b.question ?? ""))
          .filter(Boolean)
          .join("\n") || "Planen kräver dina svar för att fortsätta.";
      }
      const contentTail = state.accumulatedContent.trim().slice(-300);
      const looksLikeQuestion =
        contentTail &&
        (contentTail.slice(-25).includes("?") || contentTail.length <= 100);
      return looksLikeQuestion
        ? contentTail
        : "AI väntar på ditt svar. Läs meddelandet ovan och svara i chatten.";
    })();
  
    const quickOptions = planBlockers
      ? planBlockers.flatMap((b) =>
          Array.isArray(b.options)
            ? (b.options as string[]).slice(0, 4)
            : [],
        )
      : [];
  
    ctx.setMessages((prev) => {
      const assistantMsg = prev.find((m) => m.id === ctx.assistantMessageId);
      const hasApprovalRequested = (assistantMsg?.uiParts ?? []).some(
        (p) =>
          (p as { state?: string; type?: string }).state === "approval-requested" ||
          (p as { type?: string }).type === "tool:awaiting-input",
      );
      if (hasApprovalRequested) return prev;
      const part = {
        type: "tool:awaiting-input",
        toolName: planBlockers ? "Plan: svar krävs" : "Awaiting input",
        toolCallId: `awaiting-input:${ctx.assistantMessageId}`,
        state: "input-available",
        output: {
          question: questionPreview,
          options: quickOptions.length > 0 ? quickOptions : undefined,
          chatId: nextId,
          messageId:
            doneData.messageId ||
            doneData.message_id ||
            (doneData.latestVersion as Record<string, unknown> | undefined)?.messageId ||
            null,
          awaitingInput: true,
          planBlockers: planBlockers ?? undefined,
        },
      } as Parameters<typeof appendToolPartToMessage>[2];
      return prev.map((m) =>
        m.id === ctx.assistantMessageId
          ? { ...m, uiParts: mergeUiParts(m.uiParts, [part]) }
          : m,
      );
    });
    ctx.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== ctx.assistantMessageId || (m.content || "").trim()) return m;
        return {
          ...m,
          content: planBlockers
            ? "Planen innehåller frågor som måste besvaras innan byggfasen kan starta."
            : "Jag behöver ditt svar på en följdfråga innan nästa preview kan genereras.",
        };
      }),
    );
    toast(planBlockers ? "Planen kräver dina svar." : "AI väntar på ditt svar för att fortsätta.", {
      id: "builder-awaiting-input",
    });
  }
  
  // M#p7a: surface server-side Element Preservation Guard / shrink-guard
  // reverts. These arrive on the `done` payload but previously had no
  // client consumer, so a follow-up edit could be silently dropped.
  const rejectedStructural = Array.isArray(doneData.rejectedStructural)
    ? (doneData.rejectedStructural as Array<Record<string, unknown>>)
    : [];
  const rejectedShrinks = Array.isArray(doneData.rejectedShrinks)
    ? (doneData.rejectedShrinks as Array<Record<string, unknown>>)
    : [];
  if (rejectedStructural.length > 0 || rejectedShrinks.length > 0) {
    deps.appendProgressPart("element_guard", "reverted", {
      rejectedStructural,
      rejectedShrinks,
    });
    const revertedCount = rejectedStructural.length + rejectedShrinks.length;
    toast.warning(
      `Ändringsskyddet återställde ${revertedCount} fil(er) — din senaste ändring behölls inte. Se Agentloggen för detaljer.`,
    );
  }
  
  const planArtifact = doneData.planArtifact as Record<string, unknown> | undefined;
  if (planArtifact && typeof planArtifact === "object") {
    const planPart = {
      type: "plan" as const,
      plan: {
        title: (typeof planArtifact.goal === "string" ? planArtifact.goal : "Plan") as string,
        description: Array.isArray(planArtifact.scope)
          ? (planArtifact.scope as string[]).join(", ")
          : "",
        steps: Array.isArray(planArtifact.steps)
          ? (planArtifact.steps as Array<Record<string, unknown>>).map((s) => ({
              title: String(s.title ?? ""),
              description: String(s.description ?? ""),
              status: String(s.phase ?? "build"),
            }))
          : [],
        blockers: Array.isArray(planArtifact.blockers) ? planArtifact.blockers : [],
        assumptions: Array.isArray(planArtifact.assumptions) ? planArtifact.assumptions : [],
        raw: planArtifact,
      },
    };
    ctx.setMessages((prev) =>
      prev.map((m) =>
        m.id === ctx.assistantMessageId
          ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
          : m,
      ),
    );
  }
  
  ctx.setMessages((prev) =>
    prev.map((m) => (m.id === ctx.assistantMessageId ? { ...m, isStreaming: false } : m)),
  );
  if (state.pendingStreamErrorMessage) {
    const errTail = state.pendingStreamErrorMessage.slice(0, 280);
    toast.warning(
      `Streamen rapporterade fel tidigare, men en version eller demo returnerades ändå. ${errTail}${state.pendingStreamErrorMessage.length > 280 ? "…" : ""}`,
    );
  } else if (ctx.streamType === "create" && !awaitingInput) {
    toast.success(planArtifact ? "Plan skapad!" : "Sajt skapad!");
  }
  ctx.mutateVersions();
  const onlySelectVersionIfWasLatest = Boolean(doneData.onlySelectVersionIfWasLatest);
  ctx.onGenerationComplete?.({
    chatId: nextId,
    versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
    previewUrl: effectiveDoneDemo ?? undefined,
    onlySelectVersionIfWasLatest,
  });
  if (resolvedChatId && resolvedVersionId) {
    state.materializeQueue.push({
      chatId: String(resolvedChatId),
      versionId: String(resolvedVersionId),
    });
    state.postCheckQueue.push({
      chatId: String(resolvedChatId),
      versionId: String(resolvedVersionId),
      demoUrl: effectiveDoneDemo,
      preflight: donePreflight,
    });
  }
}
