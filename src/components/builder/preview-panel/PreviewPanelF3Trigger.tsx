"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import type { F3BuilderStatus } from "@/components/builder/F3RequirementsSurface";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { F3_REBUILD_REQUEST_EVENT } from "@/lib/builder/project-env-events";
import { runF3FinalizeAction } from "@/lib/builder/f3-finalize-action";

export interface PreviewPanelF3TriggerProps {
  chatId: string;
  versionId?: string | null;
  /**
   * Called after a successful F3 trigger with `{ parentVersionId }`.
   * The parent component is responsible for invoking the chat-stream
   * with the appropriate `meta.lifecycleStage` + `meta.parentVersionId`.
   */
  onReady?: (payload: {
    parentVersionId: string;
    requirements: Array<{
      key: string;
      name: string;
      requiredRealEnvKeys: string[];
    }>;
  }) => void;
  /** Called when the readiness check finds missing tier-3 env keys. */
  onMissingEnv?: (payload: {
    parentVersionId: string;
    projectId?: string | null;
    missingByIntegration: Array<{
      key: string;
      name: string;
      missing: string[];
    }>;
  }) => void;
  /** Refresh versions, active status and readiness after an F3 fork settles. */
  onReleaseSettled?: (payload: {
    versionId: string;
    selectVersion: boolean;
  }) => void;
  /** Reports every F3 lifecycle outcome in the persistent builder surface. */
  onStatus?: (status: F3BuilderStatus) => void;
  className?: string;
  /**
   * External "is the builder busy with another generation right now?" flag.
   * Disables the trigger so a second `/finalize-design` call (and the
   * follow-up auto-`sendMessage` from C3's `onReady`) cannot race the
   * stream that the previous click is currently running.
   */
  isBusy?: boolean;
}

type DiagnosticsResponse = {
  logs?: Array<{
    category?: string | null;
    meta?: unknown;
  }>;
};

function hasBlockingProductPostcheck(data: DiagnosticsResponse | null): boolean {
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  return logs.some((log) => {
    if (log.category !== "product_postcheck.summary") return false;
    const meta = log.meta && typeof log.meta === "object"
      ? (log.meta as Record<string, unknown>)
      : null;
    return meta?.productBlocked === true;
  });
}

/**
 * Minimal "Bygg integrationer" (F3) trigger button. Calls the
 * `/finalize-design` validator and forwards server-owned missing env keys to
 * the persistent requirements surface. Deterministic F3 forks always use
 * `runF3FinalizeAction`, preserving its exact ReleaseGate response handling.
 */
export function PreviewPanelF3Trigger({
  chatId,
  versionId,
  onReady,
  onMissingEnv,
  onReleaseSettled,
  onStatus,
  className,
  isBusy = false,
}: PreviewPanelF3TriggerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [productBlocked, setProductBlocked] = useState(false);

  useEffect(() => {
    if (!chatId || !versionId) {
      setProductBlocked(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const loadProductStatus = async () => {
      try {
        const response = await fetch(
          `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as DiagnosticsResponse | null;
        if (active && response.ok) {
          setProductBlocked(hasBlockingProductPostcheck(data));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (active) setProductBlocked(false);
      }
    };
    void loadProductStatus();
    return () => {
      active = false;
      controller.abort();
    };
  }, [chatId, versionId]);

  const runF3Flow = useCallback(async (requestedVersionId?: string | null) => {
    const targetVersionId = requestedVersionId ?? versionId;
    // Guard the programmatic (retry-event) path: without a version the finalize
    // body would be `{}` and the server can't anchor the F3 step; while busy or
    // already loading a second finalize could race the in-flight request. The
    // button is already disabled for these (so this only trips via the retry
    // event), but a silent return leaves the user without feedback — surface
    // the condition persistently in the builder instead.
    if (isBusy || isLoading) {
      onStatus?.({
        tone: "warning",
        title: "Integrationsbygget väntar",
        description: "Vänta tills den pågående körningen är klar innan du bygger integrationer igen.",
      });
      return;
    }
    if (!targetVersionId) {
      onStatus?.({
        tone: "warning",
        title: "Ingen aktiv version än",
        description: "Vänta tills första versionen är skapad innan du bygger integrationer.",
      });
      return;
    }
    if (productBlocked) {
      onStatus?.({
        tone: "warning",
        title: "Integrationsbygget är spärrat av Product Postcheck",
        description: "Åtgärda blockerande F2-previewproblem innan du bygger integrationer.",
      });
      return;
    }
    setIsLoading(true);
    try {
      const result = await runF3FinalizeAction({
        chatId,
        parentVersionId: targetVersionId,
        onDeterministicReleaseStarted: () => {
          onStatus?.({
            tone: "info",
            title: "ReleaseGate startar",
            description: "Kontrollerar den deterministiska F3-versionen innan promotion.",
          });
        },
      });

      if (result.kind === "missing_env") {
        onMissingEnv?.({
          parentVersionId: result.parentVersionId,
          projectId: result.projectId,
          missingByIntegration: result.missingByIntegration,
        });
        return;
      }

      if (result.kind === "llm_ready") {
        onStatus?.({
          tone: "success",
          title: "Integrationsbygget startar",
          description: "F3 byggs nu utifrån den finaliserade designversionen.",
        });
        onReady?.({
          parentVersionId: result.parentVersionId,
          requirements: result.requirements,
        });
        return;
      }

      if (result.kind === "error") {
        const stale = result.reason === "stale_design_version";
        onStatus?.({
          tone: stale || result.retryable ? "warning" : "error",
          title: stale
            ? "Nyare designversion finns"
            : result.retryable
              ? "F3-kontrollen kan försöka igen"
              : "F3-kontrollen misslyckades",
          description: result.message,
        });
        return;
      }

      onReleaseSettled?.({
        versionId: result.versionId,
        selectVersion: !result.superseded,
      });
      if (result.ok) {
        onStatus?.({
          tone: "success",
          title: result.alreadyPromoted ? "ReleaseGate var redan godkänd" : "ReleaseGate godkänd",
          description:
            "F3-versionen använder exakt samma filer och visuella fallback som F2.",
        });
        return;
      }
      if (result.superseded) {
        onStatus?.({
          tone: "warning",
          title: "F3-versionen ersattes av en nyare version",
          description: "ReleaseGate ändrade ingen äldre version.",
        });
        return;
      }
      if (result.promoteError || result.retryable) {
        onStatus?.({
          tone: "warning",
          title: "ReleaseGate väntar på ett nytt försök",
          description: result.message ?? "Försök igen när den pågående kontrollen är klar.",
        });
        return;
      }
      const failedChecks = result.failedChecks.join(", ");
      onStatus?.({
        tone: "error",
        title: "ReleaseGate behöver åtgärdas",
        description: result.promotionBlocked
          ? "Finalize-verifieraren blockerade promotion."
          : result.vmGatePassed === false || !result.passed
            ? failedChecks
              ? `Underkända kontroller: ${failedChecks}.`
              : "F3-versionen blev inte godkänd. Se versionsdiagnostiken."
            : "F3-versionen blev inte promotad.",
      });
    } catch (err) {
      onStatus?.({
        tone: "error",
        title: "F3-kontrollen misslyckades",
        description:
          err instanceof Error
            ? `Integrationsbygget kunde inte starta: ${err.message}`
            : "Integrationsbygget kunde inte starta.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    chatId,
    versionId,
    onReady,
    onMissingEnv,
    onReleaseSettled,
    onStatus,
    productBlocked,
    isBusy,
    isLoading,
  ]);
  const handleClick = useCallback(() => {
    void runF3Flow(versionId);
  }, [runF3Flow, versionId]);

  // Re-run the finalize flow when the Dossiers popover asks for a rebuild
  // (after the user fills the previously-missing keys). A ref keeps the
  // listener stable while always calling the latest `handleClick`.
  const handleClickRef = useRef(handleClick);
  useEffect(() => {
    handleClickRef.current = handleClick;
  }, [handleClick]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{ versionId?: unknown }>
      ).detail;
      const targetVersionId =
        typeof detail?.versionId === "string" && detail.versionId.trim()
          ? detail.versionId
          : null;
      if (targetVersionId) {
        void runF3Flow(targetVersionId);
      } else {
        void handleClickRef.current();
      }
    };
    window.addEventListener(F3_REBUILD_REQUEST_EVENT, handler);
    return () => window.removeEventListener(F3_REBUILD_REQUEST_EVENT, handler);
  }, [runF3Flow]);

  // Block the click if we don't yet have a concrete versionId — otherwise
  // the request body becomes `{}` and the server can't anchor the F3 step
  // to a parent version. Discovered in Wave 5 race-condition audit.
  const noVersion = !versionId;
  const disabledByProduct = productBlocked && !noVersion;
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={handleClick}
      disabled={isLoading || isBusy || noVersion || disabledByProduct}
      title={
        isBusy
          ? "En annan generering pågår — vänta tills den är klar innan du startar integrationsbygget."
          : noVersion
            ? "Vänta tills första versionen är skapad innan du startar integrationsbygget."
            : disabledByProduct
              ? "Product Postcheck hittade blockerande F2-previewproblem. Åtgärda dem innan du startar integrationsbygget."
            : "Bygg integrationer — då frågas du efter riktiga env-värden för externa integrationer (Stripe, Klarna, Redis m.fl.)."
      }
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
      <span className="ml-1.5">Bygg integrationer</span>
    </Button>
  );
}
