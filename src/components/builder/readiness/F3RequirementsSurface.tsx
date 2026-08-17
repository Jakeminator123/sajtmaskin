"use client";

import { AlertCircle, CheckCircle2, Info, KeyRound, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VersionDiagnosticsDialog } from "@/components/builder/diagnostics/VersionDiagnosticsDialog";
import type { F3BuilderStatus, F3MissingIntegration } from "@/lib/builder/f3-status";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openDossiersPanel } from "@/lib/builder/project-env-events";

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
 * `env-flow-f2-mute.mdc` + K1). Den här ytan listar inte nycklarna igen —
 * den visar ett kort besked och deep-linkar till Byggblock. Ingen egen editor.
 *
 * Lucka 3 (ägarbeslut 2026-08-11): den gamla "allt klart"-TEXTEN
 * ("Alla nycklar är sparade") är borta — den beskrev bara sig själv som redan
 * löst utan att faktiskt försvinna, vilket dubblerade F3-statusraden
 * (`F3StatusSurface`) ovanför. Men "Fortsätt integrationsbygget"-knappen
 * nedan är den ENDA anroparen av `requestF3Rebuild` (Bugbot, 4:e passet på
 * denna diff) — den måste finnas kvar även när `missingByIntegration` blivit
 * tom (klienten drar av nycklar allteftersom de sparas), annars kan
 * användaren inte fortsätta bygget efter att just ha fyllt i den sista
 * nyckeln. Bara beskedet döljs när det inte är något att lista; knapparna
 * nedan är alltid med.
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
  const hasMissingKeys = missingByIntegration.length > 0;

  return (
    <section
      aria-label="Krav för integrationsbygge"
      className="border-border mx-3 mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
    >
      {hasMissingKeys ? (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-amber-100/90">
            Integrationsbygget behöver nycklar — fyll i dem under Byggblock
          </p>
        </div>
      ) : null}

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
