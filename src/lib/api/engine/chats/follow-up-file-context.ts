import { FOLLOW_UP_TUNING } from "@/lib/config";
import { deriveFollowUpContextPolicy } from "@/lib/gen/build-spec";
import { hasHeavyCapabilities, inferCapabilities } from "@/lib/gen/capability-inference";
import {
  buildFileContext,
  type FileContext,
} from "@/lib/gen/context/file-context-builder";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import type { CodeFile } from "@/lib/gen/parser";
import { hasDesignFollowUpSignal } from "@/lib/providers/own-engine/follow-up-clarification";

export interface FollowUpFileContextDecision {
  fileContext: FileContext;
  contextPolicy: "light" | "normal" | "heavy";
  useLightContext: boolean;
  maxChars: number;
  maxFilesWithContent: number;
  pinnedFiles: string[];
}

export function buildFollowUpFileContextDecision(params: {
  message: string;
  previousFiles: CodeFile[];
  followUpIntent: FollowUpIntentMode;
  skipIntentClassification?: boolean;
}): FollowUpFileContextDecision {
  const inferredCapabilities = inferCapabilities(params.message);
  const capabilityHeavy = hasHeavyCapabilities(inferredCapabilities);
  const contextPolicy = deriveFollowUpContextPolicy({
    prompt: params.message,
    skipIntentClassification: params.skipIntentClassification ?? false,
    followUpIntent: params.followUpIntent,
    capabilityHeavy,
  });
  const useLightContext = contextPolicy === "light";
  const manyFiles = params.previousFiles.length > 14;
  const pinnedFiles = hasDesignFollowUpSignal(params.message)
    ? ["app/globals.css", "app/layout.tsx"]
    : [];
  const maxChars = useLightContext
    ? FOLLOW_UP_TUNING.lightContextMaxChars
    : FOLLOW_UP_TUNING.normalContextMaxChars;
  const maxFilesWithContent = useLightContext
    ? manyFiles
      ? FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles
      : FOLLOW_UP_TUNING.lightContextMaxFilesFewFiles
    : FOLLOW_UP_TUNING.normalContextMaxFiles;

  return {
    fileContext: buildFileContext({
      files: params.previousFiles,
      maxChars,
      includeContents: true,
      maxFilesWithContent,
      pinnedFiles,
      includeStructuralInventory: true,
    }),
    contextPolicy,
    useLightContext,
    maxChars,
    maxFilesWithContent,
    pinnedFiles,
  };
}
