"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { isBuilderAuthResume } from "@/lib/auth/builder-auth-draft";
import type { BuildMethod } from "@/lib/builder/build-intent";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import {
  MAX_PAGE_COUNT_CHOICE,
  getCurrentInitBuildChoices,
  setCurrentInitBuildChoices,
} from "@/lib/builder/init-build-choices";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import { canAutoStartKostnadsfriGeneration } from "./auto-start-generation";

type Params = {
  isAuthenticated: boolean;
  templateId: string | null;
  buildMethod: BuildMethod | null;
  resolvedPrompt: string | null;
  chatId: string | null;
  promptId: string | null;
  promptParam: string | null;
  setSelectedModelTier: Dispatch<SetStateAction<ModelTier>>;
  promptActions: { requestCreateChat: (message: string) => unknown };
};

/**
 * Auto-start generation for the packaged `kostnadsfri` handoff from the
 * landing page (`promptId` only). A raw `?prompt=` query must not spend
 * credits. `freeform` (fritext) deliberately does NOT auto-start
 * (user decision 2026-07-02): the prompt is only prefilled into the chat
 * input (ChatInterface `initialPrompt`, same as the audit flow) so the user
 * can pick Modell/Inställningar before the explicit send — auto-send also
 * used to force-reset the model tier below, discarding any prior choice.
 *
 * Kampanjflödet har ingen välkomstpanel att göra byggval i, så sidantalet fylls
 * här: `pageCount` går in i byggvalsstoren och blir `meta.pageCountHint`, som
 * `buildRoutePlan` föredrar framför prompttextens regex. Det är därför
 * kampanjprompten inte längre skriver ut något sidantal i prosa (ägarbeslut
 * 2026-09-14, `docs/decisions/README.md` § Kostnadsfri / sidantal).
 */
export function useBuilderAutoStartGeneration({
  isAuthenticated,
  templateId,
  buildMethod,
  resolvedPrompt,
  chatId,
  promptId,
  promptParam,
  setSelectedModelTier,
  promptActions,
}: Params) {
  const autoGenerateTriggeredRef = useRef(false);
  // Returning after a rejected request restores a draft, not permission to
  // spend credits again. Keep this pinned even when the URL is later cleaned.
  const authResumeAtMountRef = useRef(
    typeof window !== "undefined" && isBuilderAuthResume(window.location.href),
  );
  // CSRF: only the first-hydration query may authorize auto-start.
  // `useBuilderEntryHydration` strips `promptId` via router.replace in the
  // same fetch that sets `resolvedPrompt`; a live-URL check would cancel
  // the 500 ms timer and never retry.
  const hydrationPromptIdRef = useRef(promptId);
  const hydrationPromptParamRef = useRef(promptParam);

  useEffect(() => {
    if (authResumeAtMountRef.current) return;
    if (
      !canAutoStartKostnadsfriGeneration({
        isAuthenticated,
        templateId,
        buildMethod,
        resolvedPrompt,
        chatId,
        handoffPromptId: hydrationPromptIdRef.current,
        promptParam: hydrationPromptParamRef.current,
      })
    ) {
      return;
    }
    if (autoGenerateTriggeredRef.current) return;
    autoGenerateTriggeredRef.current = true;

    setSelectedModelTier(DEFAULT_MODEL_TIER);

    // Bara när inget val redan uttalats (0 = auto). Ett faktiskt byggval äger
    // sitt eget tal och ska inte skrivas över av kampanjstandarden.
    const activeChoices = getCurrentInitBuildChoices();
    if (activeChoices.pageCount < 1) {
      setCurrentInitBuildChoices({ ...activeChoices, pageCount: MAX_PAGE_COUNT_CHOICE });
    }

    const timer = setTimeout(() => {
      void promptActions.requestCreateChat(resolvedPrompt!);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    isAuthenticated,
    templateId,
    buildMethod,
    resolvedPrompt,
    chatId,
    setSelectedModelTier,
    promptActions,
  ]);
}
