import { getLatestPendingReply as getLatestPendingReplyFromTooling } from "@/components/builder/BuilderMessageTooling";
import {
  buildAddDossierMessage,
  type DossierRequestPayload,
} from "@/lib/builder/dossier-id-request";
import { toAIElementsFormat } from "@/lib/builder/message-adapter";
import {
  buildShadcnInsertMessage,
  type ShadcnInsertSelection,
} from "@/lib/builder/shadcn-insert";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { BuilderViewModel } from "../useBuilderPageController";

export function useShellRegistryInsert(
  vm: BuilderViewModel,
  sendMessage: BuilderViewModel["sendMessage"],
  isBusy: boolean,
) {
  const latestPendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(vm.messages.map(toAIElementsFormat)),
    [vm.messages],
  );

  // Katalogval i Byggblock-panelen skickar via vm.sendMessage, som ABORTAR en
  // pågående stream. Ett val mitt i en generation skulle alltså döda den, och
  // ett val medan en fråga väntar skulle tyst avfärda frågan. Disable:a
  // katalograderna i båda lägena (panelen visar en kort hint).
  const catalogPickDisabled = isBusy || Boolean(latestPendingReply);
  // Färsk spegling av upptaget-läget så en async-sändare kan omkontrollera det
  // EFTER ett await (closure-fångat `catalogPickDisabled` hinner bli inaktuellt).
  // Tilldelas i render-kroppen (inte i useEffect): en await-continuation kör
  // som microtask direkt när promiset löser och kan hinna FÖRE effect-flushen —
  // render-tilldelningen gör att refen alltid speglar senaste committade värdet.
  const catalogPickDisabledRef = useRef(catalogPickDisabled);
  catalogPickDisabledRef.current = catalogPickDisabled;
  // Färsk spegling av aktiv chatt av samma skäl: en insättning som awaitat
  // registry-hydreringen får inte skicka till en chatt användaren lämnat.
  const activeChatIdRef = useRef(vm.chatId);
  activeChatIdRef.current = vm.chatId;

  // Insättnings-lane v1 ("Lägg till"-ytan, Fas 2): valt registry-kort →
  // välformat prompt (`shadcn-insert.ts`, hämtar registry-kod best-effort) →
  // BEFINTLIGA sendMessage-vägen → own-engine genererar + verifierar
  // (RenderGate) → ny version + preview. Aldrig rå filpatch. Fel re-throwas
  // så panelens kort ALDRIG visar "skickad" för en misslyckad insättning.
  // Global in-flight-spärr: kortens egna guards är per-komponent, så parallella
  // val från Bläddra + Beskriv (t.ex. via tabbyte mitt i registry-fetchen, innan
  // isBusy hunnit bli true) skulle annars kunna nå sendMessage båda två — den
  // andra aborterar då den förstas stream.
  const shadcnInsertInFlightRef = useRef(false);
  const handleShadcnItemInsert = useCallback(
    async (selection: ShadcnInsertSelection) => {
      if (!vm.chatId) {
        toast.error("Öppna eller skapa en chat först.");
        throw new Error("no active chat");
      }
      // Samma gate som dossier-katalogvalen (`catalogPickDisabled`): sendMessage
      // ABORTAR en pågående stream, och ett val medan en fråga väntar skulle
      // tyst avfärda frågan. Kasta så kortet aldrig markeras "skickat".
      if (catalogPickDisabled) {
        toast.error(
          isBusy
            ? "Vänta tills den pågående genereringen är klar."
            : "Svara på frågan i chatten innan du lägger till block.",
        );
        throw new Error("builder busy or awaiting reply");
      }
      if (shadcnInsertInFlightRef.current) {
        toast.error("En insättning pågår redan — vänta tills den är klar.");
        throw new Error("shadcn insert already in flight");
      }
      const entryChatId = vm.chatId;
      shadcnInsertInFlightRef.current = true;
      try {
        const built = await buildShadcnInsertMessage(selection);
        // Omkontroller efter registry-fetchen (upp till 8 s): closure-fångat
        // state lästes vid entry och kan ha hunnit bli inaktuellt.
        // (1) Chattbyte: skicka aldrig till en chatt användaren lämnat.
        if (activeChatIdRef.current !== entryChatId) {
          toast.error("Chatten byttes under insättningen — försök igen från den nya chatten.");
          throw new Error("active chat changed during insert build");
        }
        // (2) Upptaget-läge: sendMessage skulle aborta en pågående stream, och
        // ett val medan en fråga väntar skulle tyst avfärda frågan — kasta i
        // stället (kortet markeras aldrig skickat). Dossier-katalogen bygger
        // meddelandet synkront och har inte det här fönstret.
        if (catalogPickDisabledRef.current) {
          toast.error("Chatten är upptagen — vänta tills den är redo och försök igen.");
          throw new Error("builder became busy during insert build");
        }
        try {
          return await sendMessage(built.message, { promptSourceMeta: built.meta });
        } catch (err) {
          toast.error("Kunde inte skicka blocket till own-engine.");
          throw err;
        }
      } finally {
        shadcnInsertInFlightRef.current = false;
      }
    },
    [sendMessage, vm.chatId, catalogPickDisabled, isBusy],
  );

  const handleRequestDossier = useCallback(
    async (payload: DossierRequestPayload): Promise<boolean> => {
      const id = payload.id.trim();
      const label = payload.label.trim();
      if (!id || !label) return false;
      // Sista försvarslinje utöver panelens disabled-rader: skicka aldrig om
      // buildern är upptagen (aborterar aktiv stream) — droppa hellre klicket.
      if (isBusy) return false;
      // Staging-vyn visar "Tillagt" bara när sändningen accepterades. Avslag
      // (stale base, 412, 409) ägs fortfarande av sändvägen — ingen extra toast
      // härifrån. `false` låter panelen stanna på "Valt, ej tillagt".
      const outcome = await sendMessage(
        buildAddDossierMessage({
          id,
          label,
          stagingLines: payload.stagingLines,
        }),
      );
      return outcome.status === "started" || outcome.status === "settled";
    },
    [sendMessage, isBusy],
  );
  return {
    latestPendingReply,
    catalogPickDisabled,
    handleShadcnItemInsert,
    handleRequestDossier,
  };
}
