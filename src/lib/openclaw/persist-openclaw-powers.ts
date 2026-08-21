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

export async function persistOpenClawPowersForActiveChat(): Promise<boolean> {
  const chatId = readActiveBuilderChatId();
  if (!chatId) return false;
  const { powersOn, grantedPowers } = useOpenClawStore.getState();
  try {
    if (await postPowers({ chatId, powersOn, granted: grantedPowers })) return true;
    if (await postPowers({ chatId, powersOn, granted: grantedPowers })) return true;
  } catch {
    // Retried below via hydrate so the UI cannot drift from the server row.
  }
  await hydrateOpenClawPowersForChat(chatId);
  return false;
}

export async function hydrateOpenClawPowersForChat(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!id) return;
  try {
    const res = await fetch(`/api/openclaw/powers?chatId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as {
      powersOn?: unknown;
      granted?: unknown;
    } | null;
    if (!data) return;
    const grantedPowers = sanitizeOpenClawPowerIds(data.granted) as OpenClawPowerId[];
    useOpenClawStore.getState().hydratePowers({
      powersOn: data.powersOn === true,
      grantedPowers,
    });
  } catch {
    // Keep the local grant; postcheck still reads the server row.
  }
}
