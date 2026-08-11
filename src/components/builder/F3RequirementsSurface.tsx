"use client";

import { AlertCircle, CheckCircle2, Info, KeyRound, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VersionDiagnosticsDialog } from "@/components/builder/VersionDiagnosticsDialog";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openDossiersPanel } from "@/lib/builder/project-env-events";

export type F3MissingIntegration = {
  key: string;
  name: string;
  missing: string[];
};

export type F3BuilderStatus = {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
  /**
   * The version this verdict is about, when there is one. The diagnostics link
   * must open THAT version's log — opening whatever happens to be selected
   * would show a green F2 design behind a red ReleaseGate line (bugbot on
   * #639). Null when the outcome precedes any version (e.g. "no version yet").
   */
  versionId?: string | null;
};

interface F3RequirementsSurfaceProps {
  projectId: string | null;
  missingByIntegration: F3MissingIntegration[];
  onRetry: () => void;
}

interface F3StatusSurfaceProps {
  status: F3BuilderStatus;
  chatId: string | null;
  versionId: string | null;
  lifecycleStage?: EngineVersionLifecycleStage | null;
}

const STATUS_ICON_STYLES: Record<F3BuilderStatus["tone"], string> = {
  info: "text-sky-400",
  warning: "text-amber-400",
  error: "text-rose-400",
  success: "text-emerald-400",
};

/**
 * F3-utfallet som en diskret rad, inte en banner (restlistan R1, beslut
 * 2026-07-28). Ett underkänt ReleaseGate är ett faktum om sajten, så raden får
 * inte försvinna helt — men detaljerna bor redan i `VersionDiagnosticsDialog`,
 * så raden bär bara rubriken plus en länk dit. Beskrivningen ligger kvar
 * `sr-only` så skärmläsare hör hela utfallet.
 */
export function F3StatusSurface({
  status,
  chatId,
  versionId,
  lifecycleStage = null,
}: F3StatusSurfaceProps) {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const Icon =
    status.tone === "success" ? CheckCircle2 : status.tone === "info" ? Info : AlertCircle;
  const canOpenDiagnostics = Boolean(chatId && versionId);

  return (
    <div
      role="status"
      aria-label="Status för integrationsbygge"
      className="text-muted-foreground mx-3 mt-2 flex items-center gap-1.5 text-[11px]"
    >
      <Icon className={`h-3 w-3 shrink-0 ${STATUS_ICON_STYLES[status.tone]}`} />
      <span className="truncate" title={status.description}>
        {status.title}
      </span>
      <span className="sr-only">{status.description}</span>
      {canOpenDiagnostics ? (
        <>
          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            className="hover:text-foreground shrink-0 underline underline-offset-2"
          >
            Visa diagnostik
          </button>
          <VersionDiagnosticsDialog
            chatId={chatId}
            versionId={versionId}
            open={isDiagnosticsOpen}
            onOpenChange={setIsDiagnosticsOpen}
            lifecycleStage={lifecycleStage}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Persistent, non-modal F3 blocker shown only after an explicit
 * "Bygg integrationer" request receives a 412 from finalize-design.
 *
 * The server owns both the integration grouping and the build-key scope. This
 * surface deliberately renders that payload as-is rather than re-detecting
 * integrations from the client, which could demand a broader set of keys.
 *
 * Byggblock är enda env-inmatningsytan (ägarbeslut 2026-07-22,
 * `env-flow-f2-mute.mdc`), så ytan listar bara vad som saknas och deep-linkar
 * dit — den har ingen egen editor mot samma API (restlistan R4).
 *
 * Lucka 3 (ägarbeslut 2026-08-11): denna komponent har inget eget "allt
 * klart"-läge längre — den beskrev bara sig själv som redan löst
 * ("Alla nycklar är sparade") utan att faktiskt försvinna, vilket dubblerade
 * F3-statusraden (`F3StatusSurface`) ovanför. Callern (`builder-shell-content/`)
 * äger nu villkoret: rendera denna yta ENDAST när `missingByIntegration` är
 * icke-tom.
 */
export function F3RequirementsSurface({
  projectId,
  missingByIntegration,
  onRetry,
}: F3RequirementsSurfaceProps) {
  const uniqueKeys = useMemo(
    () =>
      Array.from(
        new Set(
          missingByIntegration.flatMap((integration) =>
            integration.missing.map((key) => key.trim()).filter(Boolean),
          ),
        ),
      ),
    [missingByIntegration],
  );

  return (
    <section
      aria-label="Krav för integrationsbygge"
      className="border-border mx-3 mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <h2 className="font-medium text-amber-100">Krav för integrationsbygge</h2>
          <p className="mt-1 text-amber-100/80">
            Designpreviewn är kvar i F2. Fyll i värdena under Byggblock i previewen och fortsätt
            sedan integrationsbygget.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {missingByIntegration.map((integration) => (
          <div
            key={`${integration.key}:${integration.name}`}
            className="border-border/80 bg-background/50 rounded-md border p-2.5"
          >
            <p className="text-foreground font-medium">{integration.name}</p>
            <ul className="mt-2 space-y-1">
              {integration.missing.map((key) => (
                <li
                  key={`${integration.key}:${key}`}
                  className="text-muted-foreground flex items-center gap-1.5"
                >
                  <KeyRound className="h-3 w-3 shrink-0" />
                  <code className="text-foreground text-[11px]">{key}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!projectId ? (
        <p className="mt-3 text-[11px] text-amber-200">
          Miljövariabler kan sparas när chatten är kopplad till ett projekt.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {uniqueKeys.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => openDossiersPanel(uniqueKeys)}>
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            Öppna Byggblock
          </Button>
        ) : null}
        <Button size="sm" onClick={onRetry}>
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          Fortsätt integrationsbygget
        </Button>
      </div>
    </section>
  );
}
