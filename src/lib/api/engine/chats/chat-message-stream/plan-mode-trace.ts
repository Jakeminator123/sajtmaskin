/**
 * Riktad observability för plan-lägets server-turer.
 *
 * Bakgrunden är prod-chat `785c8d7a` (2026-07-30): fem user-rader i
 * `engine_messages` utan en enda assistentrad, ingen rad i
 * `engine_generation_logs` och inga runtime-fel — turerna dog utan att lämna
 * något spår att felsöka mot. Både `devLog` och generationsloggen är
 * avstängda i produktion (`NODE_ENV=production`, se `logging/shared.ts` och
 * `generation-log-writer.ts`), och `engine_generation_logs` skrivs bara av
 * finalize när en version faktiskt sparats. Plan-läget sparar ingen version,
 * så det finns per konstruktion ingen durabel rad att läsa.
 *
 * Därför skrivs plan-lägets entry/exit till `prompt_logs` — den befintliga
 * ägaren för "en rad per prompt-event", som redan hämtas per chat av `/logg`
 * (`dump-logs --kinds=prompts`). Ingen ny signalkälla, ingen ny tabell och
 * ingen migration. Utfallet ligger i `event` (synligt i alla befintliga
 * konsumenter) och detaljerna i `meta`.
 *
 * Läsanvisning vid nästa tysta sändning: en `plan_mode_turn_entry` **utan**
 * matchande `plan_mode_turn_exit` betyder att turen dog mellan planner-start
 * och persistering (avbruten ström, fryst invokering, kastande planner-anrop).
 * En `plan_mode_credit_gate_rejected` betyder att sändningen aldrig kom längre
 * än kreditgrinden. Saknas båda helt kom requesten inte fram till handlern.
 *
 * Kostnaden är två extra rader per plan-lägestur, som räknas mot `prompt_logs`
 * retention (200 rader per ägare). Plan-läget är lågvolym, och alternativet var
 * turer utan spår alls.
 *
 * Best-effort i alla lägen: kastar aldrig och får aldrig fälla en tur.
 */
import { after } from "next/server";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { devLogAppend } from "@/lib/logging/dev-log";

export const PLAN_MODE_TURN_ENTRY_EVENT = "plan_mode_turn_entry";
export const PLAN_MODE_TURN_EXIT_EVENT = "plan_mode_turn_exit";
export const PLAN_MODE_CREDIT_GATE_REJECTED_EVENT = "plan_mode_credit_gate_rejected";

/** Hur en plan-lägestur slutade, sett från persist-callbacken. */
export type PlanModeTurnExitOutcome =
  | "plan_persisted"
  | "planner_text_persisted"
  | "planner_error_persisted"
  | "planner_empty_persisted"
  | "persist_failed";

type PlanModeTraceOwner = {
  chatId: string;
  sessionId?: string | null;
  userId?: string | null;
  appProjectId?: string | null;
  modelTier?: string | null;
};

async function writePlanModeTrace(
  event: string,
  owner: PlanModeTraceOwner,
  meta: Record<string, unknown>,
): Promise<void> {
  const chatId = owner.chatId?.trim();
  if (!chatId) return;

  devLogAppend("in-progress", { type: event, chatId, ...meta });
  try {
    await createPromptLog({
      event,
      chatId,
      sessionId: owner.sessionId ?? null,
      userId: owner.userId ?? null,
      appProjectId: owner.appProjectId ?? null,
      modelTier: owner.modelTier ?? null,
      meta: { planMode: true, ...meta, observedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.warn(
      `[plan-mode-trace] Kunde inte skriva ${event} (best-effort):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * En plan-lägestur har startat: prompten är loggad, user-raden persisterad och
 * planner-strömmen är på väg. Väntas in med avsikt — anropas innan svaret
 * returneras, så invokeringen är garanterat vid liv.
 */
export async function recordPlanModeTurnEntry(
  params: PlanModeTraceOwner & {
    plannerModel: string;
    plannerThinking: boolean;
    scaffoldId: string | null;
    followUpIntent: string;
    promptSourceKind: string | null;
    hasFollowUpBase: boolean;
    previousFilesCount: number;
    /** Användarens råa text respektive den prompt planeraren faktiskt fick. */
    promptChars: number;
    optimizedPromptChars: number;
  },
): Promise<void> {
  const { chatId, sessionId, userId, appProjectId, modelTier, ...meta } = params;
  await writePlanModeTrace(
    PLAN_MODE_TURN_ENTRY_EVENT,
    { chatId, sessionId, userId, appProjectId, modelTier },
    { phase: "entry", ...meta },
  );
}

/**
 * Turen är slut och assistentraden är (eller kunde inte bli) persisterad.
 * Väntas in inne i planner-strömmen, före `done` — samma fönster som
 * persisteringen, alltså medan invokeringen fortfarande lever.
 */
export async function recordPlanModeTurnExit(
  params: PlanModeTraceOwner & {
    outcome: PlanModeTurnExitOutcome;
    assistantMessagePersisted: boolean;
    hasPlanArtifact: boolean;
    hasBlockers: boolean;
    contentChars: number;
    upstreamError: string | null;
    durationMs: number;
    persistError: string | null;
  },
): Promise<void> {
  const { chatId, sessionId, userId, appProjectId, modelTier, ...meta } = params;
  await writePlanModeTrace(
    PLAN_MODE_TURN_EXIT_EVENT,
    { chatId, sessionId, userId, appProjectId, modelTier },
    { phase: "exit", ...meta },
  );
}

/**
 * Kreditgrinden avslog sändningen. Detta är den ENDA durabla raden en avslagen
 * plan-lägestur lämnar: grinden ligger före `recordFollowUpPromptLog` och före
 * user-raden, så utan den här skrivningen ser sändningen ut att aldrig ha
 * inträffat.
 */
export async function recordPlanModeCreditGateRejected(
  params: PlanModeTraceOwner & {
    status: number;
    cost: number;
    promptChars: number;
  },
): Promise<void> {
  const { chatId, sessionId, userId, appProjectId, modelTier, ...meta } = params;
  await writePlanModeTrace(
    PLAN_MODE_CREDIT_GATE_REJECTED_EVENT,
    { chatId, sessionId, userId, appProjectId, modelTier },
    { phase: "gated", ...meta },
  );
}

/**
 * Schemalägg kreditgrindens spårrad utan att fördröja svaret.
 *
 * Ett naket `void`-anrop före `return` räcker inte på serverless: invokeringen
 * kan frysa i samma stund som svaret returneras och den lösa INSERT:en dör då
 * tyst (samma felläge som tappade `preview_url`-skrivningar, se `keepWriteAlive`
 * i `observability/llm-usage.ts`). `after()` lämnar promisen till plattformen.
 * Utanför en request-kontext (skript, tester) kastar `after()` — där finns
 * ingen invokering som kan frysa, så fire-and-forget är rätt.
 */
export function recordPlanModeCreditGateRejectedDetached(
  params: Parameters<typeof recordPlanModeCreditGateRejected>[0],
): void {
  const pending = recordPlanModeCreditGateRejected(params);
  try {
    after(pending);
  } catch {
    void pending;
  }
}
