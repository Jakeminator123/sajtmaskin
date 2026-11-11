/**
 * Byggmedgivande för Sajtagentens `start_build`.
 *
 * Samma regel avgör två saker: om ett `start_build`-kort får köra av sig
 * självt (`OpenClawMessage`), och vad servern berättar för modellen om turen
 * under `[BYGGMEDGIVANDE]` (`useOpenClawChat` → `/api/openclaw/chat`). Då kan
 * agenten aldrig lova ett bygge som kortet sedan inte startar.
 *
 * Bara en riktig användartur, eller filturen som tjänar den, kan ge
 * medgivande. En maskinväckning som `[Byggresultat]` eller en fortsättning gör
 * det aldrig. Annars kunde sammanfattningen efter ett bygge starta nästa
 * bygge, med bara prompttexten som broms.
 */
import { composerAllowsAgentBuild } from "@/lib/builder/composer-route";
import { classifyAgentMessage } from "@/lib/openclaw/agent-message-kind";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { READ_FILES_TURN_PREFIX } from "@/lib/openclaw/read-files";

export function resolveStartBuildAutoRun(
  messages: readonly OpenClawMessage[],
  messageId: string,
): { allowed: boolean; userTurnId: string | null } {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return { allowed: false, userTurnId: null };
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate.role !== "user") continue;
    const isChatTurn = classifyAgentMessage(candidate) === "chat";
    const isFileTurn = !isChatTurn && candidate.content.trimStart().startsWith(READ_FILES_TURN_PREFIX);
    if (!isChatTurn && !isFileTurn) return { allowed: false, userTurnId: candidate.id };
    if (isFileTurn) continue; // the real question sits further back
    return {
      allowed: candidate.allowBuild === true && !candidate.hydrated &&
        composerAllowsAgentBuild({ mode: "auto", text: candidate.content }),
      userTurnId: candidate.id,
    };
  }
  return { allowed: false, userTurnId: null };
}
