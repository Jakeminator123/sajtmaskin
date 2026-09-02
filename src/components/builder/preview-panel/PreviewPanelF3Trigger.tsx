"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import type { F3BuilderStatus } from "@/lib/builder/f3-status";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  F3_REBUILD_REQUEST_EVENT,
  VERSION_STATUS_REFRESHED_EVENT,
  describeF3SuccessTitle,
} from "@/lib/builder/project-env-events";
import { runF3FinalizeAction } from "@/lib/builder/f3-finalize-action";
import {
  f3MayReleaseOnVerdict,
  interpretProductPostcheckLogs,
  type ProductPostcheckVerdict,
} from "@/lib/gen/verify/product-postcheck-verdict";

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
    /** Chat the 412 belongs to (captured at request time), so a slow
     *  response cannot repopulate the surface after a chat switch. */
    chatId?: string | null;
    /** Epoch ms when the finalize request STARTED. Lets the consumer keep
     *  client-side saves that happened while the request was in flight
     *  (the server verdict predates them). */
    requestStartedAt?: number;
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
  /** Ikonläge för headerns verktygskluster — etiketten bärs av tooltip/aria. */
  iconOnly?: boolean;
  /**
   * Ö4a: vilken väg `/finalize-design` tar för den aktiva versionen, buren av
   * readiness (`info.hasRealBuildIntegrations` = pending dossier OR
   * `hasRequiredRealBuildKeys(spec)`).
   * `true` → `llm_ready` (LLM-runda, ~4–6 diamonds); `false` → `deterministic_release`
   * (0 diamonds); `null`/`undefined` → okänd → ärlig villkorad kostnad i tooltipen.
   * Härleds ALDRIG ur `buildBlockingKeys` här (den ljuger när nyckeln redan är ifylld).
   */
  requiresRealBuildKeys?: boolean | null;
}

type DiagnosticsResponse = {
  logs?: Array<{
    category?: string | null;
    message?: string | null;
    meta?: unknown;
    created_at?: Date | string | null;
  }>;
};

function verdictFromErrorLog(data: DiagnosticsResponse | null): ProductPostcheckVerdict {
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  return interpretProductPostcheckLogs(logs);
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
  iconOnly = false,
  requiresRealBuildKeys = null,
}: PreviewPanelF3TriggerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [verdict, setVerdict] = useState<ProductPostcheckVerdict>("pending");
  const productBlocked = !f3MayReleaseOnVerdict(verdict);

  useEffect(() => {
    if (!chatId || !versionId) {
      setVerdict("pending");
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const loadProductStatus = async () => {
      // A completed postcheck may refresh while the mount request is still in
      // flight. Cancel that older read so it cannot overwrite the newer
      // summary after the refresh response resolves.
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch(
          `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          { signal: requestController.signal },
        );
        const data = (await response.json().catch(() => null)) as DiagnosticsResponse | null;
        if (active && controller === requestController) {
          if (!response.ok) {
            setVerdict("indeterminate");
          } else {
            setVerdict(verdictFromErrorLog(data));
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (active && controller === requestController) setVerdict("indeterminate");
      } finally {
        if (controller === requestController) controller = null;
      }
    };
    const handleVersionStatusRefreshed = () => void loadProductStatus();
    void loadProductStatus();
    window.addEventListener(VERSION_STATUS_REFRESHED_EVENT, handleVersionStatusRefreshed);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener(VERSION_STATUS_REFRESHED_EVENT, handleVersionStatusRefreshed);
    };
  }, [chatId, versionId]);

  const runF3Flow = useCallback(async (requestedVersionId?: string | null) => {
    const targetVersionId = requestedVersionId ?? versionId;
    // Every outcome carries the version it judged, so the builder's status row
    // can open THAT version's diagnostics instead of whatever is selected when
    // the user reads it (bugbot on #639). Defaults to the version this run
    // targeted; the deterministic-release branches pass the F3 fork instead.
    const reportStatus = (status: F3BuilderStatus, judgedVersionId?: string | null) =>
      onStatus?.({ ...status, versionId: judgedVersionId ?? targetVersionId ?? null });
    // Guard the programmatic (retry-event) path: without a version the finalize
    // body would be `{}` and the server can't anchor the F3 step; while busy or
    // already loading a second finalize could race the in-flight request. The
    // button is already disabled for these (so this only trips via the retry
    // event), but a silent return leaves the user without feedback — surface
    // the condition persistently in the builder instead.
    if (isBusy || isLoading) {
      reportStatus({
        tone: "warning",
        title: "Integrationsbygget väntar",
        description: "Vänta tills den pågående körningen är klar innan du bygger integrationer igen.",
      });
      return;
    }
    if (!targetVersionId) {
      reportStatus({
        tone: "warning",
        title: "Ingen aktiv version än",
        description: "Vänta tills första versionen är skapad innan du bygger integrationer.",
      });
      return;
    }
    if (productBlocked) {
      const retryable =
        verdict === "pending" ||
        verdict === "indeterminate" ||
        verdict === "superseded";
      reportStatus({
        tone: "warning",
        title: retryable
          ? "Integrationsbygget väntar på Product Postcheck"
          : "Integrationsbygget är spärrat av Product Postcheck",
        description:
          verdict === "superseded"
            ? "Produktkontrollen ersattes av en nyare preview — försök igen."
            : retryable
              ? "Produktkontrollens dom saknas eller kunde inte läsas. Försök igen när kontrollen är klar."
              : "Åtgärda blockerande previewproblem i designläget innan du bygger integrationer.",
      });
      return;
    }
    setIsLoading(true);
    const requestStartedAt = Date.now();
    try {
      const result = await runF3FinalizeAction({
        chatId,
        parentVersionId: targetVersionId,
        onDeterministicReleaseStarted: () => {
          reportStatus({
            tone: "info",
            title: "ReleaseGate startar",
            description: "Kontrollerar den deterministiska integrationsversionen innan promotion.",
          });
        },
      });

      if (result.kind === "missing_env") {
        onMissingEnv?.({
          parentVersionId: result.parentVersionId,
          projectId: result.projectId,
          chatId,
          requestStartedAt,
          missingByIntegration: result.missingByIntegration,
        });
        return;
      }

      if (result.kind === "llm_ready") {
        reportStatus({
          tone: "success",
          title: "Integrationsbygget startar",
          description: "Integrationsbygget startar nu utifrån den finaliserade designversionen.",
        }, result.parentVersionId);
        onReady?.({
          parentVersionId: result.parentVersionId,
          requirements: result.requirements,
        });
        return;
      }

      if (result.kind === "error") {
        const stale = result.reason === "stale_design_version";
        reportStatus({
          tone: stale || result.retryable ? "warning" : "error",
          title: stale
            ? "Nyare designversion finns"
            : result.retryable
              ? "Integrationskontrollen kan försöka igen"
              : "Integrationskontrollen misslyckades",
          description: result.message,
        });
        return;
      }

      onReleaseSettled?.({
        versionId: result.versionId,
        selectVersion: !result.superseded,
      });
      if (result.ok) {
        // No dossier counts available here describe `result.versionId` — the
        // only counts this component could reach were fetched for the OLD
        // parent version, before this exact click (Bugbot, 5th pass on this
        // diff). `describeF3SuccessTitle(null)` is the honest fallback;
        // `usesLiveDossierCounts` tells the shell layer to swap in the real
        // title once ITS refetch for `result.versionId` resolves.
        reportStatus({
          tone: "success",
          title: describeF3SuccessTitle(null),
          usesLiveDossierCounts: true,
          description:
            "Integrationsversionen använder exakt samma filer och visuella fallback som designversionen.",
        }, result.versionId);
        return;
      }
      if (result.superseded) {
        reportStatus({
          tone: "warning",
          title: "Integrationsversionen ersattes av en nyare version",
          description: "ReleaseGate ändrade ingen äldre version.",
        }, result.versionId);
        return;
      }
      if (result.promoteError || result.retryable) {
        reportStatus({
          tone: "warning",
          title: "ReleaseGate väntar på ett nytt försök",
          description: result.message ?? "Försök igen när den pågående kontrollen är klar.",
        }, result.versionId);
        return;
      }
      const failedChecks = result.failedChecks.join(", ");
      reportStatus({
        tone: "error",
        title: "ReleaseGate behöver åtgärdas",
        description: result.promotionBlocked
          ? "Finalize-verifieraren blockerade promotion."
          : result.vmGatePassed === false || !result.passed
            ? failedChecks
              ? `Underkända kontroller: ${failedChecks}.`
              : "Integrationsversionen blev inte godkänd. Se versionsdiagnostiken."
            : "Integrationsversionen blev inte promotad.",
      }, result.versionId);
    } catch (err) {
      reportStatus({
        tone: "error",
        title: "Integrationskontrollen misslyckades",
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
    verdict,
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
  // Ö4a: samma knapp gör två helt olika saker och kostar olika. Säg vilken väg
  // klicket tar och vad det kostar. Vägen kommer från readiness-ägaren
  // (`requiresRealBuildKeys`), inte från en gissning i UI:t.
  const costTag =
    requiresRealBuildKeys == null
      ? "0 eller ~4–6 diamonds"
      : requiresRealBuildKeys
        ? "~4–6 diamonds"
        : "0 diamonds";
  const enabledTitle =
    requiresRealBuildKeys === false
      ? "Bygg integrationer — stämplar om designversionens filer till en publicerbar integrationsversion och kör ReleaseGate. Ingen LLM, ingen ny chatt (0 diamonds)."
      : requiresRealBuildKeys === true
        ? "Bygg integrationer — startar en LLM-runda som bygger riktig integrationskod (~4–6 diamonds). Byggnödvändiga nycklar efterfrågas före bygget; övriga kör i demo-läge tills du sparar dem under Byggblock."
        : "Bygg integrationer — 0 diamonds om inga riktiga nycklar krävs (filerna stämplas bara om), annars ~4–6 diamonds för en LLM-runda som bygger riktig integrationskod.";
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
              ? verdict === "blocked"
                ? "Product Postcheck hittade blockerande previewproblem i designläget. Åtgärda dem innan du startar integrationsbygget."
                : "Produktkontrollens dom saknas eller kunde inte läsas — F3 släpper bara på passed eller allowed_skip."
            : enabledTitle
      }
      aria-label={iconOnly ? `Bygg integrationer (${costTag})` : undefined}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
      {iconOnly ? null : <span className="ml-1.5">Bygg integrationer</span>}
    </Button>
  );
}
