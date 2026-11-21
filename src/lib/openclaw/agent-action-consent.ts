/**
 * Handlingsmedgivande för Sajtagenten: får ett action-block i det här svaret
 * köra direkt, utan att användaren klickar på ett kort?
 *
 * Ägarbeslut 2026-11-20: Sajtagenten är orkestrator i buildern. När chattens
 * befogenheter är på kör `start_build`, `request_repair` och
 * `apply_quick_edit` direkt. Samma regel avgör tre saker, så de inte kan säga
 * emot varandra:
 *
 * 1. om kortet kör av sig självt (`OpenClawMessage`),
 * 2. vad servern berättar för modellen under `[BYGGMEDGIVANDE]`
 *    (`useOpenClawChat` → `/api/openclaw/chat`),
 * 3. om sammanfattningen efter ett bygge får fortsätta uppdraget
 *    (`SajtagentProvider` → `post-build-digest.ts`).
 *
 * Det som bromsar är inte ett klick utan ett **uppdrag**:
 *
 * - Uppdraget ägs av en riktig användartur som bär `allowBuild` (läget Auto
 *   eller Bygg, ingen «ändra inget»-formulering). Läget Fråga ger aldrig
 *   medgivande, och det återkallar äldre medgivanden.
 * - Varje uppdrag har en budget: högst {@link AGENT_MISSION_ACTION_BUDGET}
 *   automatiska åtgärder. Därefter blir nästa åtgärd ett kort.
 * - En maskintur (`[Byggresultat]`) ger medgivande bara när providern själv
 *   bundit den till ett pågående uppdrag — det bygge som just blev klart
 *   startades av agenten under samma uppdrag. Annars kunde sammanfattningen
 *   efter användarens eget bygge starta nästa.
 * - En rad från sparad historik (`hydrated`) agerar aldrig igen.
 *
 * Bokföringen är modulbunden, som de övriga kvittona i `OpenClawMessage`:
 * nycklarna är meddelande-id:n från den här sessionen, så gamla poster är
 * ofarliga och en omladdning börjar på noll.
 */
import { composerAllowsAgentBuild } from "@/lib/builder/composer-route";
import { classifyAgentMessage } from "@/lib/openclaw/agent-message-kind";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { READ_FILES_TURN_PREFIX } from "@/lib/openclaw/read-files";

/** Högst så här många automatiska åtgärder per användaruppdrag. */
export const AGENT_MISSION_ACTION_BUDGET = 3;

/**
 * Hur länge ett startat bygge får vänta på sin sammanfattning. Ett bygge som
 * avbröts eller aldrig gav en version ska inte kunna föra uppdraget vidare
 * när nästa, orelaterade bygge blir klart långt senare.
 */
export const AGENT_MISSION_RESULT_TTL_MS = 30 * 60 * 1000;

/**
 * Byggströmmen som för uppdraget vidare måste ha startat i anslutning till
 * agentens åtgärd. Väntan markeras i samma stund som åtgärden skickas, så
 * strömmen startar alltid EFTER markeringen: direkt för ett direktbygge, några
 * sekunder senare för en reparation (den skickas som en händelse och samlar
 * först sitt underlag). Utanför fönstret hör strömmen till något annat — till
 * exempel ett bygge användaren själv startade efter en reparation som aldrig
 * kom igång. `LEAD` täcker bara klockans upplösning mellan två effekter.
 */
export const AGENT_MISSION_STREAM_LEAD_MS = 2_000;
export const AGENT_MISSION_STREAM_LAG_MS = 90_000;

export type AgentActionDenial =
  /** Svaret hittades inte, eller ingen användartur föregår det. */
  | "no-user-turn"
  /** Användarturen bär inget medgivande (Fråga, «ändra inget», annan yta). */
  | "no-consent"
  /** Turen kommer från sparad historik. */
  | "hydrated"
  /** En maskintur som inte hör till ett pågående uppdrag. */
  | "machine-turn"
  /** Uppdragets automatiska åtgärder är slut. */
  | "budget-spent";

export interface AgentActionConsent {
  allowed: boolean;
  /** Den riktiga användartur som äger uppdraget (budgetnyckel), annars null. */
  missionTurnId: string | null;
  /** Närmaste användartur som svaret besvarar, riktig eller intern. */
  userTurnId: string | null;
  denial: AgentActionDenial | null;
  /** Automatiska åtgärder kvar i uppdraget (0 när inget uppdrag finns). */
  remaining: number;
}

const missionActionCounts = new Map<string, number>();
/** Turer (riktiga eller interna) som redan besvarats med en automatisk åtgärd. */
const answeredTurns = new Set<string>();
let awaitingMissionResult: { missionTurnId: string; scopeKey: string; at: number } | null = null;

function denied(
  denial: AgentActionDenial,
  userTurnId: string | null,
  missionTurnId: string | null = null,
): AgentActionConsent {
  return { allowed: false, missionTurnId, userTurnId, denial, remaining: 0 };
}

/**
 * Bär den här riktiga användarturen ett levande medgivande? Flaggan sätts av
 * komposern, men textens egen spärr prövas en gång till här (frågeord, «ändra
 * inget», stopp): en felaktig eller förfalskad flagga på en fråga ska inte
 * kunna starta ett bygge.
 */
function isLiveConsentTurn(message: OpenClawMessage | undefined): boolean {
  return Boolean(
    message &&
      message.role === "user" &&
      classifyAgentMessage(message) === "chat" &&
      message.allowBuild === true &&
      !message.hydrated &&
      composerAllowsAgentBuild({ mode: "auto", text: message.content }),
  );
}

export function remainingMissionActions(missionTurnId: string): number {
  return Math.max(0, AGENT_MISSION_ACTION_BUDGET - (missionActionCounts.get(missionTurnId) ?? 0));
}

export function resolveAgentActionConsent(
  messages: readonly OpenClawMessage[],
  messageId: string,
): AgentActionConsent {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return denied("no-user-turn", null);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate.role !== "user") continue;
    const isChatTurn = classifyAgentMessage(candidate) === "chat";
    // En filtur tjänar frågan före den: det riktiga uppdraget ligger längre bak.
    if (!isChatTurn && candidate.content.trimStart().startsWith(READ_FILES_TURN_PREFIX)) continue;

    if (candidate.hydrated) return denied("hydrated", candidate.id);
    if (candidate.allowBuild !== true) {
      return denied(isChatTurn ? "no-consent" : "machine-turn", candidate.id);
    }
    const missionTurnId = isChatTurn ? candidate.id : (candidate.missionTurnId ?? null);
    if (!missionTurnId) return denied("machine-turn", candidate.id);
    const missionTurn = isChatTurn
      ? candidate
      : messages.find((message) => message.id === missionTurnId);
    if (!isLiveConsentTurn(missionTurn)) {
      // Uppdragets egen tur har återkallats (Fråga, stopp), finns inte kvar,
      // eller bär en flagga som dess text inte medger.
      return denied("no-consent", candidate.id, isChatTurn ? null : missionTurnId);
    }
    const remaining = remainingMissionActions(missionTurnId);
    if (remaining <= 0) return denied("budget-spent", candidate.id, missionTurnId);
    return { allowed: true, missionTurnId, userTurnId: candidate.id, denial: null, remaining };
  }
  return denied("no-user-turn", null);
}

/**
 * Gäller medgivandet fortfarande för en åtgärd som redan reserverat sin plats
 * i budgeten? Samma regel som ovan, men en förbrukad budget räknas inte som
 * ett återkallande: reservationen är just det som förbrukade den. Ett kort
 * som väntar på en ledig builder frågar detta precis före utskicket, så ett
 * «stopp» eller ett byte till Fråga hinner hejda det.
 */
export function isAgentActionConsentLive(
  messages: readonly OpenClawMessage[],
  messageId: string,
): boolean {
  const consent = resolveAgentActionConsent(messages, messageId);
  return consent.allowed || consent.denial === "budget-spent";
}

/**
 * Reservera en automatisk åtgärd i uppdraget. `false` när åtgärden i stället
 * ska visas som ett kort: budgeten är slut, eller ett annat svar på SAMMA tur
 * har redan agerat. En tur besvaras med högst en automatisk åtgärd — nästa
 * steg i uppdraget kommer med nästa `[Byggresultat]`, inte med ett andra svar
 * på samma fråga. Reservationen görs innan något skickas, så två svar som
 * monteras samtidigt inte båda kan köra.
 */
export function claimMissionAction(missionTurnId: string, answeredTurnId: string | null): boolean {
  const used = missionActionCounts.get(missionTurnId) ?? 0;
  if (used >= AGENT_MISSION_ACTION_BUDGET) return false;
  if (answeredTurnId) {
    if (answeredTurns.has(answeredTurnId)) return false;
    answeredTurns.add(answeredTurnId);
  }
  missionActionCounts.set(missionTurnId, used + 1);
  return true;
}

/**
 * Agenten skickar just nu ett bygge eller en reparation under uppdraget.
 * Blir det ett bygge får dess `[Byggresultat]` föra uppdraget vidare. Avvisar
 * buildern utskicket ska väntan släppas igen (`clearMissionAwaitingResult`).
 */
export function markMissionAwaitingResult(
  missionTurnId: string,
  scopeKey: string,
  now: number = Date.now(),
): void {
  awaitingMissionResult = { missionTurnId, scopeKey, at: now };
}

/**
 * Väntar ett uppdrag i den här chatten på sitt byggresultat? Ren läsning: den
 * förbrukar ingenting. Providern använder den för att väcka agenten efter
 * agentens eget bygge även när användaren stängt av kommentaren efter bygget.
 */
export function hasMissionAwaitingResult(scopeKey: string, now: number = Date.now()): boolean {
  const waiting = awaitingMissionResult;
  return Boolean(
    waiting && waiting.scopeKey === scopeKey && now - waiting.at <= AGENT_MISSION_RESULT_TTL_MS,
  );
}

/** Släpp väntan: bygget startade aldrig, avbröts, eller uppdraget återkallades. */
export function clearMissionAwaitingResult(missionTurnId?: string): void {
  if (!missionTurnId || awaitingMissionResult?.missionTurnId === missionTurnId) {
    awaitingMissionResult = null;
  }
}

/**
 * Avgör om sammanfattningen efter ett bygge får fortsätta uppdraget, och
 * förbrukar i så fall väntan (ett resultat ger högst en fortsättning).
 * `null` → vanlig sammanfattning utan åtgärd.
 */
export function takeMissionContinuation(input: {
  messages: readonly OpenClawMessage[];
  scopeKey: string;
  /** När byggströmmen som gav resultatet startade (klientklocka). */
  streamStartedAt: number | null;
  now?: number;
}): { missionTurnId: string; remaining: number } | null {
  const waiting = awaitingMissionResult;
  if (!waiting) return null;
  // En annan chatts väntan rörs inte: ett byggresultat här får inte tyst
  // avsluta ett uppdrag där. Tidsgränsen och strömfönstret skyddar den chatten.
  if (waiting.scopeKey !== input.scopeKey) return null;
  awaitingMissionResult = null;
  const now = input.now ?? Date.now();
  if (now - waiting.at > AGENT_MISSION_RESULT_TTL_MS) return null;
  if (
    input.streamStartedAt === null ||
    input.streamStartedAt < waiting.at - AGENT_MISSION_STREAM_LEAD_MS ||
    input.streamStartedAt > waiting.at + AGENT_MISSION_STREAM_LAG_MS
  ) {
    return null;
  }
  if (!isLiveConsentTurn(input.messages.find((message) => message.id === waiting.missionTurnId))) {
    return null;
  }
  const remaining = remainingMissionActions(waiting.missionTurnId);
  return remaining > 0 ? { missionTurnId: waiting.missionTurnId, remaining } : null;
}

/** Modulbunden bokföring överlever mellan tester — nollställ per test. */
export function resetAgentMissionLedgerForTests(): void {
  missionActionCounts.clear();
  answeredTurns.clear();
  awaitingMissionResult = null;
}
