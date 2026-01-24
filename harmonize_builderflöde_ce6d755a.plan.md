---
name: Harmonize builderflöde
overview: Vi jämför sajtmaskin vs sajtgen för home‑prompt‑flödet, säkrar ID‑konsistens (chatId/v0ChatId/projectId) och rensar spöktrådar så att buildern beter sig mer som sajtgen utan att ändra onödigt mycket.
todos:
  - id: env-diff-map
    content: Jämför env‑nycklar och kodanvändning
    status: completed
  - id: home-flow-align
    content: Anpassa home‑promptflödet mot sajtgen
    status: completed
  - id: id-consistency
    content: Standardisera chatId/v0ProjectId och rensa spöktråd
    status: completed
  - id: verify-flows
    content: Verifiera home/audit/registry‑flöden manuellt
    status: completed
isProject: false
---

## Kodankare (nuvarande beteende)

- Auto‑send av initial prompt när den kommer via URL:
```147:165:src/components/builder/ChatInterface.tsx
  // Auto-send when autoSend is true and we have an initialPrompt
  useEffect(() => {
    if (!autoSend) return;
    if (chatId) return;
    if (!initialPrompt?.trim()) return;
    if (autoSendTriggeredRef.current) return;
    if (isBusy || isSending) return;

    // Mark as triggered to prevent duplicate sends
    autoSendTriggeredRef.current = true;

    // Small delay to ensure UI is ready
    const timeoutId = setTimeout(() => {
      if (onCreateChat) {
        onCreateChat(initialPrompt.trim()).catch(console.error);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [autoSend, chatId, initialPrompt, isBusy, isSending, onCreateChat]);
```

- Första chatten skickar alltid system‑prompt om satt, men ingen `projectId` från klienten:
```178:197:src/lib/hooks/useV0ChatMessaging.ts
      try {
        const messageForV0 = options.skipPromptAssist
          ? initialMessage
          : await maybeEnhanceInitialPrompt(initialMessage);
        const finalMessage = appendAttachmentPrompt(messageForV0, options.attachmentPrompt);
        const thinkingForTier = selectedModelTier !== "v0-mini";
        const requestBody: Record<string, unknown> = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
        };
        const trimmedSystem = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
        if (trimmedSystem) {
          requestBody.system = trimmedSystem;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }
        const response = await fetch("/api/v0/chats/stream", {
```

- Spöktråd: registry‑import använder `internalChatId` som om det vore v0‑chatId:
```190:214:src/components/builder/InitFromRepoModal.tsx
        const response = await fetch("/api/v0/chats/init-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registryUrl }),
        });

        const data = (await response.json().catch(() => null)) as {
          internalChatId?: string;
          error?: string;
          details?: string;
        } | null;
        if (!response.ok) {
          throw new Error(data?.error || data?.details || "Failed to import block");
        }
        if (!data) {
          throw new Error("Failed to parse response");
        }
        const chatId = data.internalChatId;

        if (!chatId) {
          throw new Error("No chat ID returned");
        }

        toast.success("Component imported successfully!");
        onSuccess(chatId);
```


## Plan

- Jämför env‑nycklar mellan sajtmaskin och sajtgen och mappa till faktisk kodanvändning i `src/lib/config.ts`, `src/lib/hooks/usePromptAssist.ts` och `src/lib/v0.ts`. Säkerställ att sajtmaskin använder samma nycklar för builder‑flödet som sajtgen (utan att exponera hemligheter), och markera/ta bort oanvända nycklar om de skapar spöktrådar. Filer: [C:/Users/jakem/dev/projects/sajtmaskin/.env.local](C:/Users/jakem/dev/projects/sajtmaskin/.env.local), [C:/Users/jakem/dev/projects/sajtmaskin/.env.production](C:/Users/jakem/dev/projects/sajtmaskin/.env.production), [C:/Users/jakem/dev/projects/sajtgen/.env.local](C:/Users/jakem/dev/projects/sajtgen/.env.local), [C:/Users/jakem/dev/projects/sajtgen/.env.production.local](C:/Users/jakem/dev/projects/sajtgen/.env.production.local), [src/lib/config.ts](src/lib/config.ts).
- Justera home‑prompt‑flödet så det ligger närmare sajtgen: antingen kräva manuell skickning i buildern (ingen auto‑send) eller skicka första prompten utan system‑prompt och utan prompt‑assist. Vi implementerar det som en tydlig, begränsad regel kopplad till `prompt`‑parametern/`source` så att bara home‑flödet påverkas. Filer: [src/components/layout/home-page.tsx](src/components/layout/home-page.tsx), [src/components/forms/prompt-input.tsx](src/components/forms/prompt-input.tsx), [src/app/builder/page.tsx](src/app/builder/page.tsx), [src/components/builder/ChatInterface.tsx](src/components/builder/ChatInterface.tsx), [src/lib/hooks/useV0ChatMessaging.ts](src/lib/hooks/useV0ChatMessaging.ts), [src/lib/builder/defaults.ts](src/lib/builder/defaults.ts).
- Standardisera ID‑logik och rensa spöktrådar: gör en gemensam helper för `v0ProjectId`‑fallback och använd samma ordning i båda chat‑endpoints; se till att `init-registry` alltid ger v0‑chatId till UI (och ta bort gammal `internalChatId`‑användning/response om den inte behövs). Filer: [src/app/api/v0/chats/stream/route.ts](src/app/api/v0/chats/stream/route.ts), [src/app/api/v0/chats/route.ts](src/app/api/v0/chats/route.ts), [src/app/api/v0/chats/init-registry/route.ts](src/app/api/v0/chats/init-registry/route.ts), [src/components/builder/InitFromRepoModal.tsx](src/components/builder/InitFromRepoModal.tsx), [src/lib/tenant.ts](src/lib/tenant.ts).
- Snabb verifiering: manuellt testa “home prompt → builder” (nu ditt huvudproblem), samt audit‑flödet och registry‑import, och säkerställ att URL:en alltid har v0‑chatId och att preview/versions uppdateras. Kontrollera även att sajtgen‑likt beteende uppnåtts i home‑flödet.
