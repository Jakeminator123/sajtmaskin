"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  normalizeBuildIntent,
  normalizeBuildMethod,
  type BuildIntent,
  type BuildMethod,
} from "@/lib/builder/build-intent";

export type BuilderEntryKind =
  | "template"
  | "prompt-handoff"
  | "audit"
  | "project-restore"
  | "blank";

export interface BuilderEntryState {
  entryKind: BuilderEntryKind;
  promptParam: string | null;
  promptId: string | null;
  projectParam: string | null;
  templateId: string | null;
  chatIdParam: string | null;
  source: string | null;
  buildIntentParam: BuildIntent;
  buildMethodParam: BuildMethod | null;
  hasEntryParams: boolean;
  shouldFetchPromptHandoff: boolean;
  isTemplateEntry: boolean;
  isAuditEntry: boolean;
  isProjectRestoreCandidate: boolean;
}

export function deriveBuilderEntryState(
  searchParams: ReadonlyURLSearchParams,
): BuilderEntryState {
  const chatIdParam = searchParams.get("chatId");
  const promptParam = searchParams.get("prompt");
  const promptId = searchParams.get("promptId");
  const projectParam = searchParams.get("project");
  const templateId = searchParams.get("templateId");
  const source = searchParams.get("source");
  const buildIntentParam = normalizeBuildIntent(searchParams.get("buildIntent"));
  const buildMethodParam =
    normalizeBuildMethod(searchParams.get("buildMethod")) ||
    (source === "audit" ? "audit" : null);

  const isTemplateEntry = Boolean(templateId);
  const isAuditEntry = source === "audit";
  const shouldFetchPromptHandoff = !isTemplateEntry && Boolean(promptId);
  const hasPromptDrivenEntry = Boolean(promptParam || promptId);
  const hasEntryParams =
    isTemplateEntry || hasPromptDrivenEntry || isAuditEntry;

  let entryKind: BuilderEntryKind = "blank";
  if (isTemplateEntry) {
    entryKind = "template";
  } else if (isAuditEntry) {
    entryKind = "audit";
  } else if (hasPromptDrivenEntry) {
    entryKind = "prompt-handoff";
  } else if (Boolean(projectParam) && !chatIdParam) {
    entryKind = "project-restore";
  }

  return {
    entryKind,
    promptParam,
    promptId,
    projectParam,
    templateId,
    chatIdParam,
    source,
    buildIntentParam,
    buildMethodParam,
    hasEntryParams,
    shouldFetchPromptHandoff,
    isTemplateEntry,
    isAuditEntry,
    isProjectRestoreCandidate: entryKind == "project-restore",
  };
}
