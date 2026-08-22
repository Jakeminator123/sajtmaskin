import { readActiveBuilderChatId } from "@/lib/openclaw/builder-target";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { sanitizeOpenClawPowerIds, type OpenClawPowerId } from "@/lib/openclaw/powers";

async function postPowers(input: {
  chatId: string;
  powersOn: boolean;
  granted: readonly OpenClawPowerId[];
}): Promise<boolean> {
  const res = await fetch("/api/openclaw/powers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: input.chatId,
      powersOn: input.powersOn,
      granted: input.granted,
    }),
  });
  return res.ok;
}

let persistInFlight: Promise<boolean> | null = null;
let persistQueued = false;
let hydrateGeneration = 0;

/**
 * Write the current store grant. Overlapping toggles serialize and always
 * persist the latest snapshot so a slow revoke cannot resurrect an older tick.
 */
export async function persistOpenClawPowersForActiveChat(): Promise<boolean> {
  if (persistInFlight) {
    persistQueued = true;
    return persistInFlight;
  }
  persistInFlight = (async () => {
    try {
      let wrote = false;
      do {
        persistQueued = false;
        const chatId = readActiveBuilderChatId();
        if (!chatId) return false;
        const { powersOn, grantedPowers } = useOpenClawStore.getState();
        try {
          if (await postPowers({ chatId, powersOn, granted: grantedPowers })) {
            wrote = true;
            continue;
          }
          if (await postPowers({ chatId, powersOn, granted: grantedPowers })) {
            wrote = true;
            continue;
          }
        } catch {
          // Retried below via hydrate so the UI cannot drift from the server row.
        }
        await hydrateOpenClawPowersForChat(chatId, { allowDuringPersist: true });
        return false;
      } while (persistQueued);
      return wrote;
    } finally {
      persistInFlight = null;
    }
  })();
  return persistInFlight;
}

export async function hydrateOpenClawPowersForChat(
  chatId: string,
  opts?: { allowDuringPersist?: boolean },
): Promise<void> {
  const id = chatId.trim();
  if (!id) return;
  const generation = ++hydrateGeneration;
  try {
    const res = await fetch(`/api/openclaw/powers?chatId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    if (generation !== hydrateGeneration) return;
    if (readActiveBuilderChatId() !== id) return;
    if (persistInFlight && !opts?.allowDuringPersist) return;
    const data = (await res.json().catch(() => null)) as {
      powersOn?: unknown;
      granted?: unknown;
    } | null;
    if (!data) return;
    if (generation !== hydrateGeneration) return;
    if (readActiveBuilderChatId() !== id) return;
    if (persistInFlight && !opts?.allowDuringPersist) return;
    const grantedPowers = sanitizeOpenClawPowerIds(data.granted) as OpenClawPowerId[];
    useOpenClawStore.getState().hydratePowers({
      powersOn: data.powersOn === true,
      grantedPowers,
    });
  } catch {
    // Keep the local grant; postcheck still reads the server row.
  }
}
