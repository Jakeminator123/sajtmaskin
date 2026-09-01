"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import type { BuildMethod } from "@/lib/builder/build-intent";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
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

  useEffect(() => {
    if (
      !canAutoStartKostnadsfriGeneration({
        isAuthenticated,
        templateId,
        buildMethod,
        resolvedPrompt,
        chatId,
        promptId,
        promptParam,
      })
    ) {
      return;
    }
    if (autoGenerateTriggeredRef.current) return;
    autoGenerateTriggeredRef.current = true;

    setSelectedModelTier(DEFAULT_MODEL_TIER);

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
    promptId,
    promptParam,
    setSelectedModelTier,
    promptActions,
  ]);
}
