import { readActiveBuilderChatId } from "@/lib/openclaw/builder-target";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { sanitizeOpenClawPowerIds, type OpenClawPowerId } from "@/lib/openclaw/powers";

type PersistJob = {
  chatId: string;
  powersOn: boolean;
  granted: OpenClawPowerId[];
};

async function postPowers(input: PersistJob): Promise<boolean> {
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

let persistQueue: PersistJob[] = [];
let persistInFlight: Promise<boolean> | null = null;
let persistTargetChatId: string | null = null;
let hydrateGeneration = 0;

function enqueuePersistJob(job: PersistJob): void {
  persistQueue = persistQueue.filter((entry) => entry.chatId !== job.chatId);
  persistQueue.push(job);
}

/**
 * Write the current store grant for the active chat. Overlapping toggles
 * coalesce per chat, and a job never writes another chat's snapshot.
 */
export async function persistOpenClawPowersForActiveChat(): Promise<boolean> {
  const chatId = readActiveBuilderChatId();
  if (!chatId) return false;
  const { powersOn, grantedPowers } = useOpenClawStore.getState();
  enqueuePersistJob({
    chatId,
    powersOn,
    granted: [...grantedPowers],
  });
  if (persistInFlight) return persistInFlight;
  persistInFlight = drainPersistQueue();
  return persistInFlight;
}

async function drainPersistQueue(): Promise<boolean> {
  try {
    let wrote = false;
    while (persistQueue.length > 0) {
      const job = persistQueue.shift();
      if (!job) break;
      persistTargetChatId = job.chatId;
      try {
        if (await postPowers(job)) {
          wrote = true;
          continue;
        }
        if (await postPowers(job)) {
          wrote = true;
          continue;
        }
      } catch {
        // Hydrate only the job's chat, and only if it is still open.
      }
      if (readActiveBuilderChatId() === job.chatId) {
        await hydrateOpenClawPowersForChat(job.chatId, { allowDuringPersist: true });
      }
    }
    return wrote;
  } finally {
    persistTargetChatId = null;
    persistInFlight = null;
    if (persistQueue.length > 0) {
      persistInFlight = drainPersistQueue();
    }
  }
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
    if (persistTargetChatId === id && !opts?.allowDuringPersist) return;
    const data = (await res.json().catch(() => null)) as {
      powersOn?: unknown;
      granted?: unknown;
    } | null;
    if (!data) return;
    if (generation !== hydrateGeneration) return;
    if (readActiveBuilderChatId() !== id) return;
    if (persistTargetChatId === id && !opts?.allowDuringPersist) return;
    const grantedPowers = sanitizeOpenClawPowerIds(data.granted) as OpenClawPowerId[];
    useOpenClawStore.getState().hydratePowers({
      powersOn: data.powersOn === true,
      grantedPowers,
    });
  } catch {
    // Keep the local grant; postcheck still reads the server row.
  }
}
