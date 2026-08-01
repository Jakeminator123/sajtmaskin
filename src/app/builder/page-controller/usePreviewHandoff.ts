"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  decidePreviewHandoff,
  normalizePreviewUrl,
} from "@/lib/gen/preview/preview-url-classifier";

type Params = {
  currentPreviewUrl: string | null;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setPreviewRefreshToken: Dispatch<SetStateAction<number>>;
};

export type ApplyPreviewHandoff = (params: {
  url: string | null | undefined;
  versionId?: string | null;
  force?: boolean;
}) => void;

/**
 * Dedup'd preview handoff.
 *
 * The iframe reloads BOTH on URL change and on refresh-token bump. Every
 * preview handoff (SSE preview-ready/done, bootstrap response, non-stream
 * create/send, version sync) therefore goes through this single callback:
 * it applies `decidePreviewHandoff` (set-url OR bump, never both) with a
 * shared `versionId:url` latch so the same handoff replayed from several
 * sources reloads the iframe at most once.
 */
export function usePreviewHandoff({
  currentPreviewUrl,
  setCurrentPreviewUrl,
  setPreviewRefreshToken,
}: Params) {
  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
  }, [setPreviewRefreshToken]);

  const currentPreviewUrlRef = useRef<string | null>(currentPreviewUrl);
  useEffect(() => {
    currentPreviewUrlRef.current = currentPreviewUrl;
  }, [currentPreviewUrl]);
  const lastPreviewHandoffKeyRef = useRef<string | null>(null);

  const applyPreviewHandoff = useCallback<ApplyPreviewHandoff>(
    (params) => {
      const decision = decidePreviewHandoff({
        incomingUrl: params.url,
        currentUrl: currentPreviewUrlRef.current,
        versionId: params.versionId,
        lastAppliedKey: lastPreviewHandoffKeyRef.current,
        force: params.force,
      });
      // Persist the (possibly upgraded) key even on a `noop`: decidePreviewHandoff
      // upgrades the `?:url` placeholder to a concrete `versionId:url` for the
      // SAME on-screen URL without a reload (preview-ready fired before the
      // stream reported versionId). That upgrade must stick — otherwise the latch
      // stays `?:url` and later swallows a genuine new-version bump at the same
      // reused session URL, leaving the iframe on the previous version (Bugbot
      // high). The empty-URL decision carries a null key and must not clobber it.
      if (decision.key !== null) {
        lastPreviewHandoffKeyRef.current = decision.key;
      }
      if (decision.action === "noop") return;
      if (decision.action === "set-url") {
        const normalized = normalizePreviewUrl(params.url);
        // Sync the ref immediately — a second handoff can arrive in the same
        // tick, before the state effect above has re-run.
        currentPreviewUrlRef.current = normalized;
        setCurrentPreviewUrl(normalized);
        return;
      }
      bumpPreviewRefreshToken();
    },
    [setCurrentPreviewUrl, bumpPreviewRefreshToken],
  );

  return {
    bumpPreviewRefreshToken,
    applyPreviewHandoff,
    currentPreviewUrlRef,
    lastPreviewHandoffKeyRef,
  };
}
