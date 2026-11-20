"use client";

/**
 * Byggkuben i buildern: chattpanelens innehåll som sex sidor i en flyttbar
 * panel över förhandsvisningen, eller utfällda som sex kort.
 *
 * | Sida | Innehåll | Ägare |
 * |---|---|---|
 * | Chatt | Komposern | `ChatInterface` (utlopp) |
 * | Svar | Den gemensamma tidslinjen | `MessageList` (utlopp) |
 * | Bygglogg | F3-ytorna, senaste byggets läge, filer och arbetslogg | F3-ytorna (utlopp), `CubeBuildLogFace` |
 * | Verktyg | Befogenheter, modellnivå och byggval | `CubeToolsFace` |
 * | Avatar | Sajtagenten med röst och bild | `SajtagentAvatar` (scen) |
 * | Sajtkarta | Sajtens sidor; ett klick visar sidan | `CubeSitemapFace` |
 *
 * Komposern, tidslinjen och F3-ytorna är samma instanser som i chattpanelen:
 * skalet renderar dem en gång och kuben visar dem genom utlopp
 * (`relocation.tsx`). Ett layoutbyte avmonterar därför ingenting — utkast,
 * bilagor och pågående uppladdningar ligger kvar.
 *
 * Ytan äger bara kubens egna val: vilken sida som står fram och hur många
 * svar som inte har visats.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Bot,
  FolderTree,
  Loader2,
  MessageSquare,
  PenLine,
  ScrollText,
  SlidersHorizontal,
  TriangleAlert,
  Video,
} from "lucide-react";
import { BuilderCube, type CubeFaceSpec } from "@/components/builder/cube/BuilderCube";
import { useCubeLayout } from "@/components/builder/cube/cube-layout-storage";
import type { CubeFaceId } from "@/components/builder/cube/cube-model";
import { CubeBuildLogFace } from "@/components/builder/cube/faces/CubeBuildLogFace";
import { CubeSitemapFace } from "@/components/builder/cube/faces/CubeSitemapFace";
import { CubeToolsFace } from "@/components/builder/cube/faces/CubeToolsFace";
import { RelocationOutlet, type RelocationSlot } from "@/components/builder/cube/relocation";
import { SajtagentAvatar } from "@/components/builder/chat/sajtagent/SajtagentAvatar";
import { useSajtagent } from "@/components/builder/chat/sajtagent/SajtagentProvider";
import { countVisibleConversationMessages } from "@/components/builder/chat/conversation-count";
import type { BuilderViewModel } from "../useBuilderPageController";

/** Utloppen för det innehåll som skalet äger och kuben bara visar. */
export interface BuilderCubeSlots {
  composer: RelocationSlot;
  timeline: RelocationSlot;
  /** F3-ytorna (nycklar som saknas, integrationsbyggets läge). */
  notices: RelocationSlot;
}

export interface BuilderCubeSurfaceProps {
  vm: BuilderViewModel;
  slots: BuilderCubeSlots;
  /** Ett bygge pågår eller builderns interaktion är låst. */
  locked: boolean;
  /**
   * Status som måste synas där man skriver: samma text som raden över den
   * nedfällda chatten bär (`resolveChatCollapseStatusText`).
   */
  statusText: string | null;
  /** F3 väntar på användaren (nycklar eller «Fortsätt integrationsbygget»). */
  noticesPending: boolean;
  onExit: () => void;
}

const FACE_BUTTON_CLASS =
  "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none";

export function BuilderCubeSurface({
  vm,
  slots,
  locked,
  statusText,
  noticesPending,
  onExit,
}: BuilderCubeSurfaceProps) {
  const { layout, setLayout, resetLayout } = useCubeLayout();
  // Ett bygge som redan pågår när kuben visas (en ny chatts första bygge, en
  // omladdning mitt i ett bygge) börjar på svaren, där det syns.
  const [activeFace, setActiveFace] = useState<CubeFaceId>(() =>
    vm.isAnyStreaming ? "answers" : "chat",
  );
  const agent = useSajtagent();

  // Samma räkning som chattens «N meddelanden», utom agentens hydrerade
  // historik: den laddas efter monteringen och är inte nya svar.
  const agentMessages = agent?.messages;
  const { messageCount, sentCount } = useMemo(() => {
    const liveAgentMessages = (agentMessages ?? []).filter((message) => !message.hydrated);
    return {
      messageCount: countVisibleConversationMessages(vm.messages, liveAgentMessages),
      // Det användaren själv har skickat, till byggmotorn eller Sajtagenten.
      sentCount: countVisibleConversationMessages(
        vm.messages.filter((message) => message.role === "user"),
        liveAgentMessages.filter((message) => message.role === "user"),
      ),
    };
  }, [vm.messages, agentMessages]);

  // Det användaren skickar vrider fram svaren: frågan och svaret hamnar på
  // Svar-sidan, inte där man skrev. Ett svar som kommer senare vrider inget —
  // det får inte ta inmatningen från den som redan skriver nästa meddelande —
  // utan räknas som oläst. I kortläget syns båda, så där rörs inget.
  // Tillståndet justeras under rendering (inte i en effekt), som i
  // `FloatingCollapsedChatInput`: en ny räkning ger rätt sida i samma bild.
  const [tracked, setTracked] = useState({ messages: messageCount, sent: sentCount });
  const [seenCount, setSeenCount] = useState(messageCount);
  if (tracked.messages !== messageCount || tracked.sent !== sentCount) {
    setTracked({ messages: messageCount, sent: sentCount });
    if (tracked.messages === 0) {
      // En öppnad chatt laddar sin historik efter monteringen. Den är varken
      // något att vrida fram eller något oläst.
      setSeenCount(messageCount);
    } else if (sentCount > tracked.sent && layout.mode === "cube" && activeFace === "chat") {
      setActiveFace("answers");
    }
  }
  const answersVisible =
    layout.mode === "cards" ? !layout.folded.includes("answers") : activeFace === "answers";
  if (answersVisible && seenCount !== messageCount) setSeenCount(messageCount);
  const unread = answersVisible ? 0 : Math.max(0, messageCount - seenCount);

  // Visar en sida oavsett läge: kuben vrids dit; i kortläget fälls kortet ut
  // och lyfts överst.
  const revealFace = useCallback(
    (face: CubeFaceId) => {
      setLayout((current) => {
        if (current.mode !== "cards") return current;
        const folded = current.folded.includes(face)
          ? current.folded.filter((id) => id !== face)
          : current.folded;
        const order =
          current.order.at(-1) === face
            ? current.order
            : [...current.order.filter((id) => id !== face), face];
        return folded === current.folded && order === current.order
          ? current
          : { ...current, folded, order };
      });
      setActiveFace(face);
    },
    [setLayout],
  );
  const showChat = useCallback(() => revealFace("chat"), [revealFace]);
  const showBuildLog = useCallback(() => revealFace("buildlog"), [revealFace]);

  const isStreaming = vm.isAnyStreaming;
  const composerStatus = isStreaming ? "Bygger …" : statusText;
  const sitemapVisible =
    layout.mode === "cards" ? !layout.folded.includes("sitemap") : activeFace === "sitemap";

  const faces = useMemo<Record<CubeFaceId, CubeFaceSpec>>(
    () => ({
      chat: {
        label: "Chatt",
        icon: <MessageSquare />,
        content: (
          // Ytan ovanför komposern växer (`flex-1`) i stället för att
          // komposern slutjusteras: innehåll som svämmar över uppåt i en
          // slutjusterad flexbox går inte att rulla till.
          <div className="flex h-full min-h-0 flex-col overflow-y-auto">
            {layout.mode === "cube" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-4 text-center">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
                  <MessageSquare className="size-5" aria-hidden="true" />
                </span>
                <p className="text-foreground text-sm font-medium">Vad vill du göra med sajten?</p>
                <p className="text-muted-foreground max-w-64 text-xs leading-5">
                  Ställ en fråga eller beskriv en ändring. Svaret visas under Svar.
                </p>
              </div>
            ) : (
              // Som kort står svaren bredvid; då behövs ingen vägvisning.
              <div className="flex-1" />
            )}
            <div>
              {composerStatus ? (
                <div
                  className="border-border/60 bg-muted/30 text-muted-foreground mx-4 mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                  role="status"
                  data-testid="cube-composer-status"
                >
                  {isStreaming ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-foreground/90 min-w-0 flex-1 truncate">{composerStatus}</span>
                  <button
                    type="button"
                    onClick={showBuildLog}
                    className="hover:text-foreground focus-visible:ring-ring shrink-0 rounded-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Visa bygglogg
                  </button>
                </div>
              ) : null}
              <RelocationOutlet slot={slots.composer} />
            </div>
          </div>
        ),
      },
      answers: {
        label: "Svar",
        icon: <Bot />,
        badge: unread > 0 ? unread : undefined,
        content: (
          <div className="flex h-full min-h-0 flex-col">
            <RelocationOutlet
              slot={slots.timeline}
              className="relative min-h-0 flex-1 overflow-hidden"
            />
            {layout.mode === "cube" ? (
              <div className="border-border/60 shrink-0 border-t p-2">
                <button type="button" onClick={showChat} className={`${FACE_BUTTON_CLASS} w-full`}>
                  <PenLine className="size-3" aria-hidden="true" />
                  Skriv ett nytt meddelande
                </button>
              </div>
            ) : null}
          </div>
        ),
      },
      buildlog: {
        label: "Bygglogg",
        icon: <ScrollText />,
        badge: isStreaming || statusText || noticesPending ? "dot" : undefined,
        content: (
          <div className="flex h-full min-h-0 flex-col">
            {/* F3-ytorna bär sina egna marginaler; tomt utlopp tar ingen plats. */}
            <RelocationOutlet slot={slots.notices} className="max-h-1/2 shrink-0 overflow-y-auto" />
            <div className="min-h-0 flex-1">
              <CubeBuildLogFace messages={vm.messages} isStreaming={isStreaming} />
            </div>
          </div>
        ),
      },
      tools: {
        label: "Verktyg",
        icon: <SlidersHorizontal />,
        content: (
          <CubeToolsFace
            selectedModelTier={vm.selectedModelTier}
            onSelectedModelTierChange={vm.setSelectedModelTier}
            digestEnabled={vm.tipsEnabled}
            onDigestEnabledChange={vm.setTipsEnabled}
            enableThinking={vm.enableThinking}
            onEnableThinkingChange={vm.setEnableThinking}
            enableImageGenerations={vm.enableImageGenerations}
            onEnableImageGenerationsChange={vm.setEnableImageGenerations}
            imageGenerationsSupported={vm.isImageGenerationsSupported}
            locked={locked}
            agentConfigured={Boolean(agent?.configured ?? agent?.available)}
          />
        ),
      },
      avatar: {
        label: "Avatar",
        icon: <Video />,
        content: <SajtagentAvatar variant="stage" />,
      },
      sitemap: {
        label: "Sajtkarta",
        icon: <FolderTree />,
        content: (
          <CubeSitemapFace
            chatId={vm.chatId}
            versionId={vm.activeVersionId}
            previewUrl={vm.currentPreviewUrl}
            refreshToken={vm.previewRefreshToken}
            visible={sitemapVisible}
            onNavigatePreviewUrl={vm.setCurrentPreviewUrl}
          />
        ),
      },
    }),
    [
      agent?.available,
      agent?.configured,
      composerStatus,
      isStreaming,
      layout.mode,
      locked,
      noticesPending,
      showBuildLog,
      showChat,
      sitemapVisible,
      slots.composer,
      slots.notices,
      slots.timeline,
      statusText,
      unread,
      vm.activeVersionId,
      vm.chatId,
      vm.currentPreviewUrl,
      vm.enableImageGenerations,
      vm.enableThinking,
      vm.isImageGenerationsSupported,
      vm.messages,
      vm.previewRefreshToken,
      vm.selectedModelTier,
      vm.setCurrentPreviewUrl,
      vm.setEnableImageGenerations,
      vm.setEnableThinking,
      vm.setSelectedModelTier,
      vm.setTipsEnabled,
      vm.tipsEnabled,
    ],
  );

  return (
    <BuilderCube
      label="Byggkuben"
      faces={faces}
      activeFace={activeFace}
      onActiveFaceChange={setActiveFace}
      position={{ x: layout.cube.x, y: layout.cube.y }}
      onPositionChange={(position) => setLayout((l) => ({ ...l, cube: { ...l.cube, ...position } }))}
      size={{ width: layout.cube.width, height: layout.cube.height }}
      onSizeChange={(size) => setLayout((l) => ({ ...l, cube: { ...l.cube, ...size } }))}
      mode={layout.mode}
      onModeChange={(mode) => setLayout((l) => ({ ...l, mode }))}
      cards={{ rects: layout.cards, folded: layout.folded, order: layout.order }}
      onCardsChange={(cards) =>
        setLayout((l) => ({ ...l, cards: cards.rects, folded: cards.folded, order: cards.order }))
      }
      onResetLayout={resetLayout}
      onExit={onExit}
    />
  );
}
