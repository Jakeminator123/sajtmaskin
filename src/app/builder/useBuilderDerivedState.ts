"use client";

import type { ChatMessage } from "@/lib/builder/types";
import { useMemo } from "react";

export type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  demoUrl?: string | null;
  createdAt?: string | Date | null;
};

export type ChatData = {
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
  const chatV0ProjectId = chat?.v0ProjectId ?? null;

  const isAnyStreaming = useMemo(
    () => messages.some((m) => Boolean(m.isStreaming)),
    [messages],
  );

  const isAwaitingInput = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return Boolean(last?.uiParts?.some((p) => p.type === "tool:awaiting-input"));
  }, [messages]);

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
      demoUrl: latest?.demoUrl ?? null,
      createdAt: latest?.createdAt ?? new Date().toISOString(),
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
    const sortedByTime = [...effectiveVersionsList].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      return bTime - aTime;
    });
    const latestFromVersions = sortedByTime[0]?.versionId || sortedByTime[0]?.id || null;
    const latestFromChat = chat?.latestVersion?.versionId || chat?.latestVersion?.id || null;
    return latestFromVersions || latestFromChat;
  }, [effectiveVersionsList, chat]);

  const activeVersionId = selectedVersionId || latestVersionId;
  const mediaEnabled = isMediaEnabled && enableBlobMedia;
  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;

  return {
    chatV0ProjectId,
    isAnyStreaming,
    isAwaitingInput,
    versionsList,
    effectiveVersionsList,
    versionIdSet,
    latestVersionId,
    activeVersionId,
    mediaEnabled,
    initialPrompt: auditPromptLoaded ? initialPrompt : null,
  };
}
