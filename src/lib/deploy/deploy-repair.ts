/**
 * A3 — MANUELL deploy-repair ("Publicera om med fix").
 *
 * Speglar preview-VM:ens repair-loop till deploy-vägen, men enligt låst beslut
 * Ö3: repair körs BARA på uttryckligt knapptryck och auto-redeploya ALDRIG.
 * Detta modul-lager gör själva repair-anropet (bygg-loggkontext + återanvänd
 * `triggerBuildErrorRepair`); route:n (`/api/v0/deployments/repair`) äger
 * HTTP-/tenant-/idempotens-logiken.
 *
 * Utfallet blir en `repair_available`-version som användaren sedan accepterar
 * (`accept-repair`) och publicerar om MANUELLT. Här sker ingen promotion och
 * ingen redeploy.
 */
import { dbConfigured } from "@/lib/db/client";
import { REPAIR_LOOP_BUDGET_MS } from "@/lib/gen/defaults";
import { triggerBuildErrorRepair } from "@/lib/gen/verify/server-verify";
import { isQualityGateConfigured } from "@/lib/gen/verify/preview-quality-gate";
import { getVercelDeploymentBuildLogText } from "@/lib/vercelDeploy";

export type DeployRepairStatus =
  /** En repair sparades och väntar på accept + manuell ompublicering. */
  | "repair_available"
  /** Loopen kördes men kunde inte lösa bygg-felet. */
  | "failed"
  /** En repair/verify-körning äger redan versionen (samtidig körning). */
  | "repairing"
  /** En nyare version finns — reparera den senaste i stället. */
  | "superseded"
  /** Kunde inte startas (kvalitetskontroll otillgänglig / DB ej konfigurerad). */
  | "unavailable";

export interface RunDeployBuildRepairResult {
  status: DeployRepairStatus;
  summary?: string | null;
  repairAvailableAt?: string | null;
  /** Rådsignal från `triggerBuildErrorRepair` — endast för loggning/debug. */
  skippedReason?: string;
}

export interface RunDeployBuildRepairParams {
  chatId: string;
  versionId: string;
  /** Vercels deployment-id — används för best-effort byggloggshämtning. */
  vercelDeploymentId?: string | null;
  /** Feltext som redan finns (från deploy-error-loggen), fallback för kontext. */
  fallbackMessage: string;
}

/**
 * Kör en repair mot `versionId` med den failade deployens bygg-fel som kontext.
 * Idempotens + tenant-guard hanteras av route:n; här förlitar vi oss dessutom
 * på `triggerBuildErrorRepair`s lease + `inflight`-dedup så samma version aldrig
 * repareras dubbelt parallellt.
 */
export async function runDeployBuildRepair(
  params: RunDeployBuildRepairParams,
): Promise<RunDeployBuildRepairResult> {
  const { chatId, versionId, vercelDeploymentId, fallbackMessage } = params;

  // Repair kräver DB + konfigurerad kvalitetskontroll (preview-host verify).
  // Skilj detta miljöfall från "redan igång" (inflight) så UI:t inte felaktigt
  // säger "reparation pågår" när gaten i själva verket saknas.
  if (!dbConfigured || !isQualityGateConfigured()) {
    return { status: "unavailable", skippedReason: "quality_gate_unconfigured" };
  }

  // Best-effort: hämta faktisk Vercel-byggloggtext (kort timeout, aldrig
  // blockerande). Faller tillbaka på den feltext som redan loggats.
  const logText = vercelDeploymentId
    ? await getVercelDeploymentBuildLogText(vercelDeploymentId, { timeoutMs: 4000 }).catch(
        () => null,
      )
    : null;
  const message = logText && logText.trim().length > 0 ? logText.trim() : fallbackMessage;

  // Ref-wrapper: `onRepairAvailable` muteras inuti en closure, vilket TS inte
  // spårar på en rak `let` (skulle smalna till `null`/`never` efter await:en).
  // Att läsa en objekt-property ger dess deklarerade typ, så narrowing funkar.
  const repairPayloadRef: {
    current: {
      versionId: string;
      summary: string | null;
      repairAvailableAt: string | null;
    } | null;
  } = { current: null };

  // Bind loopen till route:ns maxDuration (endpointet är synkront).
  const repairDeadlineEpochMs = Date.now() + REPAIR_LOOP_BUDGET_MS;

  const outcome = await triggerBuildErrorRepair({
    chatId,
    versionId,
    buildError: {
      stage: "vercel-deploy",
      message,
      failureCode: null,
    },
    // Ö3: manuellt knapptryck — kringgå auto-repair-env-gaten. Detta redeployar
    // ALDRIG; det producerar bara en `repair_available`-version.
    force: true,
    repairDeadlineEpochMs,
    onRepairAvailable: (payload) => {
      repairPayloadRef.current = payload;
    },
  });

  if (outcome.repairAvailable && repairPayloadRef.current) {
    return {
      status: "repair_available",
      summary: repairPayloadRef.current.summary,
      repairAvailableAt: repairPayloadRef.current.repairAvailableAt,
    };
  }

  switch (outcome.skippedReason) {
    case "lease_busy":
    case "not_eligible":
      // Gate/DB är redan bekräftat konfigurerade ovan, så `not_eligible` betyder
      // här process-lokal inflight → en samtidig repair/verify äger versionen.
      return { status: "repairing", skippedReason: outcome.skippedReason };
    case "not_latest":
      return { status: "superseded", skippedReason: outcome.skippedReason };
    case "no_files":
    case "auto_repair_disabled":
      return { status: "unavailable", skippedReason: outcome.skippedReason };
    default:
      // Loopen kördes (started) men sparade ingen repair → kunde inte fixa.
      return { status: outcome.started ? "failed" : "unavailable" };
  }
}
