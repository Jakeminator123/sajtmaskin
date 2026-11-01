"use client";

import type { ChatMessage } from "@/lib/builder/types";
import { planIsVerifiedReady, toAIElementsFormat } from "@/lib/builder/message-adapter";
import { getLatestPendingReply, hasUserMessageAfter } from "@/components/builder/chat/tooling/pending-replies";
import { selectPreferredEngineVersion } from "@/lib/db/engine-version-lifecycle";
import type { VersionStatus } from "@/lib/logging/event-bus-types";
import { useMemo } from "react";

export type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  previewUrl?: string | null;
  demoUrl?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
  previewPending?: boolean;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  promotedAt?: string | Date | null;
  /** Own-engine rows use `false`; legacy mapped chats use `true`. */
  canPin?: boolean;
  /** Event-bus projection from GET /versions — seeds UI lock before poll. */
  busStatus?: VersionStatus | null;
};

export type ChatData = {
  previewUrl?: string | null;
  demoUrl?: string | null;
  latestVersion?: VersionSummary | null;
  v0ProjectId?: string | null;
} | null;

type Args = {
  chatId: string | null;
  messages: ChatMessage[];
  selectedVersionId: string | null;
  chat: ChatData;
  versions: unknown;
  templateId: string | null;
  resolvedPrompt: string | null;
  auditPromptLoaded: boolean;
  isMediaEnabled: boolean;
  enableBlobMedia: boolean;
};

export function useBuilderDerivedState({
  chatId: _chatId,
  messages,
  selectedVersionId,
  chat,
  versions,
  templateId,
  resolvedPrompt,
  auditPromptLoaded,
  isMediaEnabled,
  enableBlobMedia,
}: Args) {
  const chatExternalProjectId = chat?.v0ProjectId ?? null;

  const isAnyStreaming = useMemo(
    () => messages.some((m) => Boolean(m.isStreaming)),
    [messages],
  );

  const adaptedMessages = useMemo(() => messages.map(toAIElementsFormat), [messages]);
  const pendingReply = useMemo(
    () => getLatestPendingReply(adaptedMessages),
    [adaptedMessages],
  );
  const isAwaitingInput = Boolean(pendingReply);

  // Match MessageList: a pending reply wins over approval, and a later user
  // turn consumes a plan. A later assistant answer alone does not consume it.
  const isAwaitingPlanApproval = useMemo(() => {
    if (pendingReply) return false;
    return adaptedMessages.some(
      (message, index) =>
        message.role === "assistant" &&
        !message.isStreaming &&
        !hasUserMessageAfter(adaptedMessages, index) &&
        message.parts.some(
          (part) => part.type === "plan" && !part.isStreaming && planIsVerifiedReady(part.plan),
        ),
    );
  }, [adaptedMessages, pendingReply]);

  const versionsList = useMemo(
    () => (Array.isArray(versions) ? (versions as VersionSummary[]) : []),
    [versions],
  );

  const effectiveVersionsList = useMemo(() => {
    const list = [...versionsList];
    const latest = chat?.latestVersion;
    const latestId = latest?.versionId || latest?.id || null;
    if (!latestId) return list;
    const exists = list.some(
      (v) => v.versionId === latestId || v.id === latestId,
    );
    if (exists) return list;
    list.unshift({
      versionId: latest?.versionId || latest?.id || null,
      id: latest?.id || null,
      previewUrl: latest?.previewUrl ?? latest?.demoUrl ?? null,
      demoUrl: latest?.demoUrl ?? null,
      createdAt: latest?.createdAt ?? new Date().toISOString(),
      versionNumber: latest?.versionNumber ?? null,
      previewPending: latest?.previewPending ?? false,
      releaseState: latest?.releaseState ?? null,
      verificationState: latest?.verificationState ?? null,
      verificationSummary: latest?.verificationSummary ?? null,
      promotedAt: latest?.promotedAt ?? null,
      canPin: latest?.canPin,
    });
    return list;
  }, [versionsList, chat]);

  const versionIdSet = useMemo(
    () =>
      new Set(
        effectiveVersionsList
          .map((v) => v.versionId || v.id || null)
          .filter((id): id is string => Boolean(id)),
      ),
    [effectiveVersionsList],
  );

  const latestVersionId = useMemo(() => {
    const preferredVersion = selectPreferredEngineVersion(
      effectiveVersionsList.map((version) => ({
        ...version,
        createdAt:
          typeof version.createdAt === "string" || version.createdAt instanceof Date
            ? version.createdAt
            : null,
        versionNumber: typeof version.versionNumber === "number" ? version.versionNumber : null,
      })),
    );
    const latestFromVersions = preferredVersion?.versionId || preferredVersion?.id || null;
    const latestFromChat = chat?.latestVersion?.versionId || chat?.latestVersion?.id || null;
    return latestFromVersions || latestFromChat;
  }, [effectiveVersionsList, chat]);

  const activeVersionId = selectedVersionId || latestVersionId;
  const mediaEnabled = isMediaEnabled && enableBlobMedia;
  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;

  return {
    chatExternalProjectId,
    isAnyStreaming,
    isAwaitingInput,
    isAwaitingPlanApproval,
    versionsList,
    effectiveVersionsList,
    versionIdSet,
    latestVersionId,
    activeVersionId,
    mediaEnabled,
    initialPrompt: auditPromptLoaded ? initialPrompt : null,
  };
}

