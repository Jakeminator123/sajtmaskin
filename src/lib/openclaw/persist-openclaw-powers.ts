import { readActiveBuilderChatId } from "@/lib/openclaw/builder-target";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { sanitizeOpenClawPowerIds, type OpenClawPowerId } from "@/lib/openclaw/powers";

export async function persistOpenClawPowersForActiveChat(): Promise<void> {
  const chatId = readActiveBuilderChatId();
  if (!chatId) return;
  const { powersOn, grantedPowers } = useOpenClawStore.getState();
  try {
    await fetch("/api/openclaw/powers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        powersOn,
        granted: grantedPowers,
      }),
    });
  } catch {
    // Best-effort: postcheck fail-closed if the write never landed.
  }
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
    // Keep the local empty grant; postcheck still reads the server row.
  }
}
