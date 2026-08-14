import { classifyRequestKind, requestKindClassificationFields } from "@/lib/gen/request-kind";
import { devLogAppend } from "@/lib/logging/dev-log";

export type RequestKindGenerationKind = "init" | "followup";

/**
 * Measurement-only. Logs `request.kind.classified` and returns the result.
 * Does not short-circuit codegen — callers that already skip codegen for
 * `qa-or-score` keep that gate locally.
 */
export function logRequestKindClassification(params: {
  message: string;
  generationKind: RequestKindGenerationKind;
  chatId?: string | null;
}): ReturnType<typeof classifyRequestKind> {
  const result = classifyRequestKind(params.message);
  devLogAppend("in-progress", {
    type: "request.kind.classified",
    generationKind: params.generationKind,
    chatId: params.chatId ?? null,
    ...requestKindClassificationFields(result),
  });
  return result;
}