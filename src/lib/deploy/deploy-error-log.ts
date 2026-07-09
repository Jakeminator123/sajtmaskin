/**
 * A3 — enhetlig loggning av Vercel-deploy-fel (asynkront build-fel).
 *
 * När en deployment går till `error` (både webhook `deployment.error` och
 * poll-vägen i `[deploymentId]/events`) körs detta best-effort. Det speglar
 * hur preview-VM:ens build-fel loggas, så deploy-vägen får samma spårbarhet:
 *
 *  1. `engine_version_error_logs`-rad (category `"deploy"`) — durabel, syns i
 *     backoffice + `/logg`.
 *  2. `appendErrorLogEvent(...)` — matar TF-IDF error-log-RAG (fault
 *     `"vercel-build-error"`).
 *  3. `version.build.error`-bus-event — samma signal som preview-VM:en använder,
 *     så statusprojektionen/observatören ser deploy-felet.
 *
 * SÄKERHET: helt best-effort. Får ALDRIG kasta eller blockera anroparens
 * status-uppdatering. Auto-triggar ALDRIG någon repair (Ö3: repair körs bara på
 * manuell knapp). No-op om chatId/versionId saknas (t.ex. legacy-rader).
 */
import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import { emitVersionErrorLogs } from "@/lib/logging/event-bus-error-log-sink";

/** Kort slug som binder ihop deploy-felets alla loggvägar. */
export const DEPLOY_BUILD_ERROR_FAULT = "vercel-build-error";

export interface LogDeployErrorParams {
  chatId?: string | null;
  versionId?: string | null;
  /** `deployments.id` (intern rad) — för korsreferens i meta. */
  deploymentId?: string | null;
  /** Vercels deployment-id (`dpl_…`), om känt. */
  vercelDeploymentId?: string | null;
  /** Vercel-inspektörslänk, om känd (A4 exponerar den i UI). */
  inspectorUrl?: string | null;
  /** Tillgänglig feltext. Faller tillbaka på en generisk text när tom. */
  message?: string | null;
  /**
   * Var felet fångades — endast för telemetri/meta. `refresh` = en
   * status-refresh-väg (deployments list-/single-GET eller POST:ens
   * initiala statusläsning) vann den atomiska övergången till `error`
   * före webhook/poll och äger därmed loggen (BB#deploy2).
   */
  source: "webhook" | "poll" | "refresh";
}

/**
 * Logga ett Vercel-deploy-fel på alla tre vägar (DB + RAG + bus). Best-effort:
 * sväljer alla fel internt så anroparens status-write aldrig påverkas.
 */
export async function logDeployError(params: LogDeployErrorParams): Promise<void> {
  const chatId = params.chatId?.trim();
  const versionId = params.versionId?.trim();
  // Legacy/okänd rad utan engine-ids: inget att hänga loggen på — no-op.
  if (!chatId || !versionId) return;

  const message =
    typeof params.message === "string" && params.message.trim().length > 0
      ? params.message.trim()
      : "Vercel-bygget misslyckades efter att publiceringen accepterats.";

  const meta: Record<string, unknown> = {
    fault: DEPLOY_BUILD_ERROR_FAULT,
    source: params.source,
    deploymentId: params.deploymentId ?? null,
    vercelDeploymentId: params.vercelDeploymentId ?? null,
    inspectorUrl: params.inspectorUrl ?? null,
  };

  // 1) Durabel DB-rad + observerbar signal via ETT bus-event. OMTAG-06:
  //    `engine_version_error_logs` har en enda skrivare — bus-sinken
  //    (`installDbErrorLogSubscriber`). Vi emit:ar därför via
  //    `emitVersionErrorLogs` i stället för att BÅDE skriva direkt OCH emit:a
  //    `version.build.error` (det gav två rader när sinken var laddad i samma
  //    process). Att importera sink-modulen auto-installerar subscribern, så
  //    raden skrivs pålitligt även i webhook-/poll-processen. Emit:en är också
  //    den observerbara `version.build.error`-signalen. Triggar INTE någon
  //    auto-repair (Ö3: repair körs bara på manuell knapp).
  try {
    emitVersionErrorLogs([
      {
        chatId,
        versionId,
        level: "error",
        category: "deploy",
        message,
        meta,
      },
    ]);
  } catch (err) {
    console.warn(
      "[deploy-error-log] Kunde inte logga deploy-fel via bus (best-effort):",
      err instanceof Error ? err.message : err,
    );
  }

  // 2) TF-IDF error-log-RAG. `appendErrorLogEvent` sväljer själv alla fel.
  //    Phase begränsas av `ErrorLogPhase` (ingen "deploy"): använd "server" +
  //    subphase "deploy" så typkontraktet hålls (RAG-fasägaren är Lane B).
  appendErrorLogEvent({
    phase: "server",
    subphase: "deploy",
    creator: "vercel-deploy",
    severity: "error",
    fault: DEPLOY_BUILD_ERROR_FAULT,
    faultText: message,
    provider: "vercel",
    result: "still-failing",
    chatId,
    versionId,
  });
}
