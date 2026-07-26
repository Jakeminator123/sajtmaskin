/**
 * Per-chat "chattens utdata är nedfälld"-läge (Ö9). Samma
 * localStorage-mönster som `chat-generation-settings.ts`: läget är en
 * arbetsyte-preferens, inte projektdata, så det hör hemma i webbläsaren och
 * inte i databasen. Nyckeln är per chat eftersom en chat man just läst inte
 * ska tvinga fram nedfällt läge i nästa.
 */
const CHAT_OUTPUT_COLLAPSE_PREFIX = "sajtmaskin:chatOutputCollapsed:";

function buildKey(chatId: string): string {
  return `${CHAT_OUTPUT_COLLAPSE_PREFIX}${chatId}`;
}

export function readChatOutputCollapsed(chatId: string | null): boolean {
  if (!chatId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(buildKey(chatId)) === "1";
  } catch {
    return false;
  }
}

export function writeChatOutputCollapsed(chatId: string | null, collapsed: boolean): void {
  if (!chatId || typeof window === "undefined") return;
  try {
    if (collapsed) {
      localStorage.setItem(buildKey(chatId), "1");
    } else {
      localStorage.removeItem(buildKey(chatId));
    }
  } catch {
    // ignore storage errors
  }
}
