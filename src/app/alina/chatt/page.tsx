"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT, OpenClawChatPanel } from "@/components/openclaw/OpenClawChatPanel";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

export default function AlinaChatPage() {
  const router = useRouter();
  const scope = useOpenClawStore((state) => state.scopeKey);
  useEffect(() => {
    const chat = useOpenClawStore.getState();
    chat.setScope("/alina/chatt");
    chat.setAvatarMode(true);
    chat.setPanelPresentation("takeover");
    chat.open();
    return () => useOpenClawStore.getState().close();
  }, []);
  return (
    <main className="mx-auto h-dvh max-w-3xl p-2 sm:p-6">
      {scope === "/alina/chatt" && <OpenClawChatPanel localAlina
        onClose={() => router.push("/alina")}
        content={{ ...DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT, assistantLabel: "Alina",
          emptyTitle: "Hej! Jag heter Alina.", inputPlaceholder: "Skriv till Alina…",
        }}
      />}
    </main>
  );
}
