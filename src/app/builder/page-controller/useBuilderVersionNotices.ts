"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { ChatRunStatus } from "@/lib/hooks/useVersions";

type Params = {
  versions: unknown;
  chatStatus: ChatRunStatus | null;
};

/**
 * Version-derived notices: the "versionless aborted" flag consumed by the
 * preview empty-state plus the one-shot toast for server repairs that are
 * waiting to be accepted in the version panel.
 */
export function useBuilderVersionNotices({ versions, chatStatus }: Params) {
  // P0 stream-abort recovery (2026-04-26). When the chat has no versions
  // and the most recent run is in `aborted` status, we treat it as
  // "versionless aborted" — the preview empty-state shows "Starta om
  // generation" instead of "Försök reparera preview", and the parent
  // component will route a click into a fresh chat rather than a
  // followup_general against the dead chatId. Failed runs (verifier
  // rejected real content) do NOT count here — those still have a
  // version to repair.
  const versionlessAborted = useMemo(() => {
    if (Array.isArray(versions) && versions.length > 0) return false;
    if (!chatStatus) return false;
    if (chatStatus.hasVersion) return false;
    return chatStatus.status === "aborted";
  }, [versions, chatStatus]);

  const repairAvailableToastShownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!Array.isArray(versions) || versions.length === 0) return;
    const latest = versions[0] as Record<string, unknown> | undefined;
    if (!latest) return;
    const vid = typeof latest.id === "string" ? latest.id : null;
    const state = typeof latest.verificationState === "string" ? latest.verificationState : null;
    if (vid && state === "repair_available" && !repairAvailableToastShownRef.current.has(vid)) {
      repairAvailableToastShownRef.current.add(vid);
      toast.message("Serverreparation tillgänglig", {
        description: "Acceptera reparationen i versionspanelen för att applicera fixen.",
      });
    }
  }, [versions]);

  return { versionlessAborted };
}
