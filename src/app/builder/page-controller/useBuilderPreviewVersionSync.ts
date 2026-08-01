"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useMemo } from "react";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import {
  derivePreviewLifecycleState,
  type PreviewLifecycleState,
} from "@/lib/builder/preview-lifecycle";
import {
  isCompatibilityShimPreviewUrl,
  isShimOrMissingPreviewUrl,
} from "@/lib/gen/preview/legacy/compatibility-shim";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import type { ChatData, VersionSummary } from "../useBuilderDerivedState";
import {
  pickVersionPreviewUrl,
  shouldPreserveUserRouteNavigation,
  shouldRetainLastGoodPreviewOnVersionChange,
  shouldRetainLiveTier2DuringAsyncPersist,
  versionSummaryHasPreview,
} from "../builder-page-preview-helpers";
import type { ApplyPreviewHandoff } from "./usePreviewHandoff";

type Params = {
  activeVersionId: string | null;
  latestVersionId: string | null;
  effectiveVersionsList: VersionSummary[];
  selectedVersionId: string | null;
  chat: ChatData;
  chatId: string | null;
  clearedPreviewVersionId: string | null;
  currentPreviewUrl: string | null;
  currentPreviewUrlRef: MutableRefObject<string | null>;
  lastActiveVersionIdRef: MutableRefObject<string | null>;
  previewBuildError: { stage: string; message: string } | null;
  previewPending: boolean;
  previewSessionRecovering: boolean;
  serverProjectChatId: string | null;
  serverProjectDemoUrl: string | null;
  serverProjectPreviewOverrideUrl: string | null;
  serverProjectPreviewOverrideVersionId: string | null;
  applyPreviewHandoff: ApplyPreviewHandoff;
  setClearedPreviewVersionId: Dispatch<SetStateAction<string | null>>;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setPreviewPending: Dispatch<SetStateAction<boolean>>;
  setPreviewRefreshToken: Dispatch<SetStateAction<number>>;
};

/**
 * Version → preview URL synchronisation plus the derived preview lifecycle.
 *
 * The effect resolves which URL the iframe should show for the active version
 * (own preview URL, persisted override, chat/project fallback) and holds the
 * last-good live preview through the windows where the version row has not
 * caught up yet.
 */
export function useBuilderPreviewVersionSync({
  activeVersionId,
  latestVersionId,
  effectiveVersionsList,
  selectedVersionId,
  chat,
  chatId,
  clearedPreviewVersionId,
  currentPreviewUrl,
  currentPreviewUrlRef,
  lastActiveVersionIdRef,
  previewBuildError,
  previewPending,
  previewSessionRecovering,
  serverProjectChatId,
  serverProjectDemoUrl,
  serverProjectPreviewOverrideUrl,
  serverProjectPreviewOverrideVersionId,
  applyPreviewHandoff,
  setClearedPreviewVersionId,
  setCurrentPreviewUrl,
  setPreviewPending,
  setPreviewRefreshToken,
}: Params): PreviewLifecycleState {
  // Preview URL sync when active version changes
  useEffect(() => {
    const didChangeVersion = lastActiveVersionIdRef.current !== activeVersionId;
    lastActiveVersionIdRef.current = activeVersionId;

    if (didChangeVersion && clearedPreviewVersionId && clearedPreviewVersionId !== activeVersionId) {
      setClearedPreviewVersionId(null);
    }

    // Do not skip when only `currentPreviewUrl` is set: the active version can gain `previewUrl` later
    // (async preview session + SWR refresh) while `activeVersionId` stays the same — keep the live preview URL when it arrives.
    if (!didChangeVersion && clearedPreviewVersionId === activeVersionId) return;

    const activeVersionMatch = activeVersionId
      ? effectiveVersionsList.find(
          (v) => v.versionId === activeVersionId || v.id === activeVersionId,
        )
      : undefined;
    const persistedPreviewOverride =
      activeVersionId &&
      serverProjectPreviewOverrideVersionId === activeVersionId &&
      serverProjectPreviewOverrideUrl
        ? serverProjectPreviewOverrideUrl
        : null;
    const chatObj = chat as ChatData;
    const canUseServerDemoUrl =
      !serverProjectChatId || !chatId || serverProjectChatId === chatId;
    const userSelectedActiveVersion =
      Boolean(selectedVersionId) &&
      Boolean(activeVersionMatch) &&
      (activeVersionMatch?.versionId === selectedVersionId || activeVersionMatch?.id === selectedVersionId);
    const firstUsableVersion =
      effectiveVersionsList.find((version) => canExposeEnginePreview(version)) ??
      effectiveVersionsList[0];
    const chatLatest = chatObj?.latestVersion;
    const chatLevelPreview =
      chatLatest && canExposeEnginePreview(chatLatest)
        ? typeof chatLatest.previewUrl === "string" && chatLatest.previewUrl.trim()
          ? chatLatest.previewUrl.trim()
          : null
        : null;

    const selectedVersionPreview =
      persistedPreviewOverride ||
      pickVersionPreviewUrl(activeVersionMatch, { allowFailed: userSelectedActiveVersion }) ||
      null;
    const fallbackPreviewUrl =
      chatLevelPreview ||
      pickVersionPreviewUrl(firstUsableVersion) ||
      (canUseServerDemoUrl && typeof serverProjectDemoUrl === "string" && serverProjectDemoUrl.trim()
        ? serverProjectDemoUrl.trim()
        : null) ||
      null;
    const nextDemoUrl = userSelectedActiveVersion ? selectedVersionPreview : selectedVersionPreview || fallbackPreviewUrl;

    const currentIsLivePreview = currentPreviewUrl != null && !isShimOrMissingPreviewUrl(currentPreviewUrl);
    const nextIsShimPreview = nextDemoUrl != null && isShimOrMissingPreviewUrl(nextDemoUrl);

    // Hard guard: never downgrade an established tier-2 (VM/live) preview URL
    // back to a compatibility shim URL within the same active version. The
    // shim renders raw JSX without Tailwind and shows a blue overlay, which
    // is jarring when the live preview is already running. This happens when
    // the persisted version row in the DB still has a shim URL while the SSE
    // stream has already set the tier-2 URL on the client. Without this guard
    // the version-sync effect re-renders and overwrites the live URL.
    if (
      currentPreviewUrl != null &&
      isTier2LivePreviewUrl(currentPreviewUrl) &&
      nextDemoUrl != null &&
      isCompatibilityShimPreviewUrl(nextDemoUrl) &&
      !didChangeVersion
    ) {
      return;
    }

    if (
      currentIsLivePreview &&
      nextIsShimPreview &&
      versionSummaryHasPreview(activeVersionMatch, { allowFailed: userSelectedActiveVersion })
    ) {
      return;
    }

    if (!nextDemoUrl && didChangeVersion && currentPreviewUrl) {
      // Keep the last-good live (tier-2/VM) preview visible while the newly
      // active version is still spinning up its own preview (no previewUrl in
      // the versions list yet). Blanking here was the "white preview" flash on
      // follow-up completion: the client auto-selects the freshly generated
      // draft the instant the stream ends — seconds before its VM preview is
      // running. VM bootstrap + preview-session polling replace this URL once
      // the new preview is ready, and the version_mismatch / "startar preview"
      // overlays render on top of the retained frame instead of a white panel.
      if (
        shouldRetainLastGoodPreviewOnVersionChange({
          didChangeVersion,
          nextDemoUrl,
          currentPreviewUrl,
          // Retain only for a just-generated follow-up version: either its row
          // hasn't arrived from the `/versions` refetch yet (`!activeVersionMatch`
          // — true on the first render after `done`, before `latestVersionId`
          // catches up) OR it is the newest non-failed version. A manually
          // selected OLDER version already in the list is neither, so we never
          // pin the previous frame over a different, user-chosen version.
          activeVersionIsFreshOrLatest:
            !activeVersionMatch ||
            (Boolean(activeVersionId) && activeVersionId === latestVersionId),
        })
      ) {
        return;
      }
      setCurrentPreviewUrl(null);
      currentPreviewUrlRef.current = null;
      setPreviewRefreshToken(Date.now());
      return;
    }

    // Async-persist window guard (preview-lifecycle): the preview-session route
    // persists `preview_url` via after() for a fast response, so a `/versions`
    // refetch can briefly return the active row with a null preview_url. Without
    // this guard the effect falls back to a chat/project URL (possibly stale)
    // and reloads the iframe away from the correct tier-2 live preview that
    // SSE/bootstrap already put on screen for THIS same version. Hold the live
    // preview until the row's own url persists (then it either matches — a
    // no-op — or is a legit sync once `activeVersionHasOwnPreview` flips true).
    if (
      shouldRetainLiveTier2DuringAsyncPersist({
        didChangeVersion,
        userSelectedActiveVersion,
        activeVersionHasOwnPreview: Boolean(selectedVersionPreview),
        nextDemoUrl,
        currentPreviewUrl,
      })
    ) {
      setPreviewPending(false);
      return;
    }

    if (nextDemoUrl && nextDemoUrl !== currentPreviewUrl) {
      // Page-tab navigation guard: within the same version + same tier-2
      // session, `currentPreviewUrl` may carry a user-chosen subroute
      // (`/<chatId>/<route>`) while the version row only stores the session
      // base URL. Overwriting here snapped the iframe back to "/" right
      // after every tab click (this effect re-runs on `currentPreviewUrl`).
      // See `shouldPreserveUserRouteNavigation` for the ownership contract.
      if (
        shouldPreserveUserRouteNavigation({
          didChangeVersion,
          nextDemoUrl,
          currentPreviewUrl,
        })
      ) {
        // Same live session is already on screen — keep the user's route but
        // still clear the pending flag the URL-write branch would have cleared.
        if (!isShimOrMissingPreviewUrl(nextDemoUrl)) {
          setPreviewPending(false);
        }
        return;
      }
      // Dedup'd handoff: the URL change alone reloads the iframe (no token
      // bump on top), and the shared latch prevents a re-reload when the
      // stream/bootstrap already delivered this exact version+URL.
      applyPreviewHandoff({ url: nextDemoUrl, versionId: activeVersionId });
      if (!isShimOrMissingPreviewUrl(nextDemoUrl)) {
        setPreviewPending(false);
      }
    }
  }, [activeVersionId, latestVersionId, selectedVersionId, chat, currentPreviewUrl, effectiveVersionsList, serverProjectDemoUrl, serverProjectChatId, chatId, lastActiveVersionIdRef, currentPreviewUrlRef, serverProjectPreviewOverrideUrl, serverProjectPreviewOverrideVersionId, clearedPreviewVersionId, setClearedPreviewVersionId, setCurrentPreviewUrl, setPreviewRefreshToken, setPreviewPending, applyPreviewHandoff]);

  const previewLifecycle: PreviewLifecycleState = useMemo(
    () =>
      derivePreviewLifecycleState({
        previewBuildErrorStage: previewBuildError?.stage ?? null,
        hasPreviewBuildError: Boolean(previewBuildError),
        previewSessionRecovering,
        previewPending,
        currentPreviewUrl,
      }),
    [previewBuildError, previewSessionRecovering, previewPending, currentPreviewUrl],
  );

  return previewLifecycle;
}
