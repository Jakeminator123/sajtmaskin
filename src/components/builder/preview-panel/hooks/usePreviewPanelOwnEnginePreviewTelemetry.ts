"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { reportRenderOutcome } from "@/lib/gen/eval/render-telemetry";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import {
  INITIAL_PREVIEW_RENDER_OUTCOME_STATE,
  describePreviewDiagnosticCode,
  nextPreviewRenderOutcomeState,
  previewDiagnosticCodeFromKind,
  previewDiagnosticStageFromKind,
  shouldAutoFixPreviewDiagnostic,
  shouldReportPreviewOutcome,
} from "@/lib/gen/preview/diagnostics";
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { buildOwnEngineRoutePreviewUrl } from "../preview-route-helpers";
import type { PreviewIssuePayload } from "../iframe-diagnostics";
import type { PreviewIframeMessage } from "../preview-panel-types";

type ReportFailure = (payload: PreviewIssuePayload) => void;

/**
 * Own-engine shim preview: error-log POST, autofix dispatch, render-outcome telemetry,
 * and iframe postMessage (navigation-attempt, preview-ready, preview-error).
 *
 * Call **after** `usePreviewIframe` in the parent so setter callbacks exist. Wire iframe
 * failures into this module via `reportOwnEngineRenderFailureSink`: parent passes a stable
 * wrapper that forwards to `sinkRef.current`, and this hook assigns the real implementation
 * each render.
 */
export function usePreviewPanelOwnEnginePreviewTelemetry(options: {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  setIframeLoading: Dispatch<SetStateAction<boolean>>;
  setIframeError: Dispatch<SetStateAction<boolean>>;
  setIframeErrorMessage: Dispatch<SetStateAction<string | null>>;
  onNavigatePreviewUrl?: ((url: string) => void) | null;
  reportOwnEngineRenderFailureSink: MutableRefObject<ReportFailure>;
}): void {
  const {
    chatId,
    versionId,
    previewUrl,
    iframeRef,
    setIframeLoading,
    setIframeError,
    setIframeErrorMessage,
    onNavigatePreviewUrl,
    reportOwnEngineRenderFailureSink,
  } = options;

  const isOwnEnginePreview = Boolean(
    previewUrl && isCompatibilityShimPreviewUrl(previewUrl),
  );

  const previewIssueKeysRef = useRef<Set<string>>(new Set());
  const renderOutcomeStateRef = useRef(INITIAL_PREVIEW_RENDER_OUTCOME_STATE);

  const reportPreviewIssue = useCallback(
    async (payload: PreviewIssuePayload) => {
      if (!chatId || !versionId) return;

      const message = payload.message?.trim();
      if (!message) return;

      const kind = payload.kind?.trim() || "runtime";
      const code = payload.code?.trim() || previewDiagnosticCodeFromKind(kind);
      const stage = payload.stage?.trim() || previewDiagnosticStageFromKind(kind);
      const source = payload.source?.trim() || "own-engine-preview";
      const dedupeKey = `${chatId}:${versionId}:${code}:${message}`;
      if (previewIssueKeysRef.current.has(dedupeKey)) return;
      previewIssueKeysRef.current.add(dedupeKey);

      const reason = describePreviewDiagnosticCode(code) ?? "Previewfel upptäckt.";
      const meta = {
        source,
        demoUrl: previewUrl,
        kind,
        previewKind: kind,
        previewCode: code,
        previewStage: stage,
        previewSource: source,
        name: payload.name ?? null,
        message,
        stack: payload.stack ?? null,
      };

      try {
        await fetch(
          `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: "error",
              category: "preview",
              message: reason,
              meta,
            }),
          },
        );
      } catch (error) {
        console.warn("[Preview] Failed to persist preview issue:", error);
      }

      if (shouldAutoFixPreviewDiagnostic(code)) {
        dispatchAutoFixEvent({
          chatId,
          versionId,
          reasons: [reason],
          meta,
        });
        toast.error("Preview-fel upptäckt. Försöker reparera automatiskt.", { duration: 5000 });
      } else {
        toast.error(reason, { duration: 5000 });
      }
    },
    [chatId, versionId, previewUrl],
  );

  const reportOwnEngineRenderFailure = useCallback(
    (payload: PreviewIssuePayload) => {
      void reportPreviewIssue(payload);
      if (!chatId || !versionId) return;
      if (!shouldReportPreviewOutcome(renderOutcomeStateRef.current, versionId, "failure")) return;
      renderOutcomeStateRef.current = nextPreviewRenderOutcomeState(versionId, "failure");
      const errorMsg =
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message
          : "Preview render error";
      const errorKind = typeof payload.kind === "string" ? payload.kind : "runtime";
      const errorCode =
        typeof payload.code === "string" ? payload.code : previewDiagnosticCodeFromKind(errorKind);
      const errorStage =
        typeof payload.stage === "string"
          ? payload.stage
          : previewDiagnosticStageFromKind(errorKind);
      void reportRenderOutcome({
        chatId,
        versionId,
        success: false,
        source: "own-engine",
        demoUrl: previewUrl ?? undefined,
        errorMessage: errorMsg,
        errorCategory: errorKind,
        errorCode,
        errorStage,
      });
    },
    [chatId, versionId, previewUrl, reportPreviewIssue],
  );

  reportOwnEngineRenderFailureSink.current = reportOwnEngineRenderFailure;

  useEffect(() => {
    previewIssueKeysRef.current.clear();
    renderOutcomeStateRef.current = INITIAL_PREVIEW_RENDER_OUTCOME_STATE;
  }, [chatId, versionId, previewUrl]);

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent<PreviewIframeMessage>) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "sajtmaskin-preview") return;
      if (!isOwnEnginePreview) return;

      if (data.type === "navigation-attempt") {
        const href = typeof data.payload?.href === "string" ? data.payload.href : "";
        if (!previewUrl || !href) return;
        const nextUrl = buildOwnEngineRoutePreviewUrl(previewUrl, href);
        if (nextUrl && nextUrl !== previewUrl) {
          onNavigatePreviewUrl?.(nextUrl);
        }
        return;
      }

      if (data.type === "preview-ready" && chatId && versionId) {
        setIframeLoading(false);
        setIframeError(false);
        setIframeErrorMessage(null);
        if (!shouldReportPreviewOutcome(renderOutcomeStateRef.current, versionId, "success")) {
          return;
        }
        renderOutcomeStateRef.current = nextPreviewRenderOutcomeState(versionId, "success");
        void reportRenderOutcome({
          chatId,
          versionId,
          success: true,
          source: "own-engine",
          demoUrl: previewUrl ?? undefined,
        });
        return;
      }

      if (data.type !== "preview-error") return;
      reportOwnEngineRenderFailure(data.payload ?? {});
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [
    previewUrl,
    chatId,
    versionId,
    isOwnEnginePreview,
    onNavigatePreviewUrl,
    reportOwnEngineRenderFailure,
    iframeRef,
    setIframeLoading,
    setIframeError,
    setIframeErrorMessage,
  ]);
}
