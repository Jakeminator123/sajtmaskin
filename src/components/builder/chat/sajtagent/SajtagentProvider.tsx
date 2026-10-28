"use client";

/**
 * Sajtagentens hem i buildern (plan 2026-10-22 «En chatt», etapp E1).
 *
 * Äger det den flytande panelen ägde förut — `useOpenClawChat`, den armerade
 * continuation-slingan, health-flaggorna (OC_DEBUG/OC_EDIT) och befogenhets-
 * hydreringen — och lägger till det som bara den gemensamma chatten behöver:
 * beständig historik per chatt (E5) och «nästa steg» efter ett bygge (E6).
 *
 * Komposern och meddelandelistan läser `useSajtagent()`; utan provider
 * (tester, andra ytor) får de `null` och beter sig som förut.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";
import type { KostnadsfriCampaignScriptState } from "@/lib/kostnadsfri/agent-campaign-script";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { hydrateAgentHistory, persistAgentMessages } from "@/lib/openclaw/agent-history";
import { hydrateOpenClawPowersForChat } from "@/lib/openclaw/persist-openclaw-powers";
import {
  buildPostBuildDigestPrompt,
  decidePostBuildDigest,
  type PostBuildDigestSnapshot,
} from "@/lib/openclaw/post-build-digest";
import { useOpenClawChat, type OpenClawSendOptions } from "@/components/openclaw/useOpenClawChat";
import { useOpenClawArmedContinuation } from "@/components/openclaw/useOpenClawArmedContinuation";
import { parseOpenClawMessage } from "@/lib/openclaw/text-field-actions";
import {
  buildReadFilesLimitTurn,
  buildReadFilesTurn,
  READ_FILES_MAX_ROUNDS,
  selectRequestedFiles,
  type ReadableFile,
} from "@/lib/openclaw/read-files";
import { classifyAgentMessage } from "@/lib/openclaw/agent-message-kind";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { isOpenClawSurfaceEnabledOnPage } from "@/lib/openclaw/surface-flag";

export interface SajtagentContextValue {
  /** Sajtagentens yta är aktiverad för den här deployen (health). */
  available: boolean;
  messages: OpenClawMessage[];
  isStreaming: boolean;
  send: (text: string, options?: OpenClawSendOptions) => Promise<void>;
  stop: () => void;
  clearConversation: () => void;
  armedMandate: ArmedMandate | null;
  campaignScript: KostnadsfriCampaignScriptState | null;
}

const SajtagentContext = createContext<SajtagentContextValue | null>(null);

export function useSajtagent(): SajtagentContextValue | null {
  return useContext(SajtagentContext);
}

export interface SajtagentProviderProps {
  chatId: string | null;
  activeVersionId: string | null;
  activeVersionStatus: string | null;
  activeVersionIsLatest: boolean;
  isAnyStreaming: boolean;
  /** Inställningen «Sajtagenten kommenterar efter bygget» (f.d. tips). */
  digestEnabled: boolean;
  children: ReactNode;
}

type HealthResponse = {
  surfaceEnabled?: boolean;
  debugEnabled?: boolean;
  editEnabled?: boolean;
} | null;

export function SajtagentProvider({
  chatId,
  activeVersionId,
  activeVersionStatus,
  activeVersionIsLatest,
  isAnyStreaming,
  digestEnabled,
  children,
}: SajtagentProviderProps) {
  const chat = useOpenClawChat();
  const setDebugEnabled = useOpenClawStore((s) => s.setDebugEnabled);
  const setEditEnabled = useOpenClawStore((s) => s.setEditEnabled);
  const editEnabled = useOpenClawStore((s) => s.editEnabled);
  const armedMandate = useOpenClawStore((s) => s.armedMandate);
  const campaignScript = useOpenClawStore((s) => s.campaignScript);
  const [available, setAvailable] = useState(false);

  // Health: ytans aktivering + läs-/agera-grindarna. Samma best-effort som
  // panelen hade: ett misslyckat anrop lämnar agenten passiv. Anropet görs
  // bara när root-layouten säger att ytan finns (`surface-flag.ts`): en deploy
  // utan OpenClaw ska inte betala en enda extra request vid builderns start.
  useEffect(() => {
    if (!isOpenClawSurfaceEnabledOnPage()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/openclaw/health");
        const data = (await res.json().catch(() => null)) as HealthResponse;
        if (cancelled) return;
        setAvailable(data?.surfaceEnabled === true);
        setDebugEnabled(data?.debugEnabled === true);
        setEditEnabled(data?.editEnabled === true);
      } catch {
        if (cancelled) return;
        setAvailable(false);
        setDebugEnabled(false);
        setEditEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDebugEnabled, setEditEnabled]);

  // Beständig historik: fyll på storen när en chatt öppnas — först när ytan
  // bekräftats, så builderns egen laddning (projekt, versioner, filer) inte
  // konkurrerar med ett agentanrop som ändå inte används.
  //
  // Ordningsvakt mot scope-bytet: `OpenClawChat` (root-layouten) sätter
  // storens scope till `…::<chatId>` och tömmer minnet när builderns kontext
  // annonserar en ny chatt. Hydreringen får bara ske när scopen redan pekar på
  // den här chatten — annars kunde ett sent scope-byte radera det vi just
  // hämtade (Bugbot på #1670). Samma villkor gäller när svaret kommer.
  const chatIdRef = useRef(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);
  const scopeKey = useOpenClawStore((s) => s.scopeKey);
  const scopeMatchesChat = Boolean(chatId && scopeKey.endsWith(`::${chatId}`));
  useEffect(() => {
    if (!chatId || !available || !scopeMatchesChat) return;
    void hydrateAgentHistory(
      chatId,
      () =>
        chatIdRef.current === chatId &&
        useOpenClawStore.getState().scopeKey.endsWith(`::${chatId}`),
    );
  }, [chatId, available, scopeMatchesChat]);

  // Befogenheter per chatt (default-på för en ny builderchatt, se
  // `persist-openclaw-powers.ts`). Samma ordningsvakt som historiken: scope-
  // bytet nollar även `powersOn`/`grantedPowers`, så hydreringen sker först
  // när scopen pekar på chatten, och om igen om scopen byts därefter
  // (`scopeKey` i deps). `editEnabled` blir bara sant efter en lyckad
  // health-koll, så inget anrop sker på en deploy utan ytan.
  useEffect(() => {
    if (!chatId || !editEnabled || !scopeMatchesChat) return;
    void hydrateOpenClawPowersForChat(chatId);
  }, [chatId, editEnabled, scopeMatchesChat, scopeKey]);

  // Transportägaren lämnar en snapshot vid avslut, stopp eller scope-byte.
  // Läs aldrig den levande storen i ett sent finally: då kan nästa svar redan
  // strömma, och dess halvfärdiga innehåll skulle låsas i den idempotenta DB:n.
  // Hela snapshoten ingår så tidigare okvitterade rader kan försöka igen.
  const chatSend = chat.send;
  const send = useCallback(
    async (text: string, options?: OpenClawSendOptions) => {
      const chatAtSend = chatIdRef.current;
      await chatSend(text, {
        ...options,
        onConversationSettled: (messages) => {
          if (chatAtSend) void persistAgentMessages(chatAtSend, messages);
          options?.onConversationSettled?.(messages);
        },
      });
    },
    [chatSend],
  );

  useOpenClawArmedContinuation(send);

  // Senaste `send` för effekter som inte ska startas om när den byter identitet.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Kodnavigering: när agentens senaste svar ber om filer (`read_files`) hämtas
  // innehållet från filer-API:t (ägarverifierat) och skickas tillbaka som en
  // intern `[Filinnehåll]`-tur. Rundor räknas per användarfråga så en modell
  // som ber om fil efter fil inte kan loopa; hydrerade rader körs aldrig.
  //
  // Bokföring: ett svar räknas som hanterat först när dess tur faktiskt
  // skickats (eller medvetet nekats), så en hämtning som avbryts av ett
  // chattbyte inte tystar frågan för gott. `inFlight` hindrar dubbla
  // hämtningar för samma svar medan den första pågår.
  const handledReadIdsRef = useRef<Set<string>>(new Set());
  const inFlightReadIdRef = useRef<string | null>(null);
  const readRoundsRef = useRef<{ userMessageId: string | null; rounds: number; limitSent: boolean }>({
    userMessageId: null,
    rounds: 0,
    limitSent: false,
  });
  const activeVersionIdRef = useRef(activeVersionId);
  useEffect(() => {
    activeVersionIdRef.current = activeVersionId;
  }, [activeVersionId]);
  const agentStreaming = chat.isStreaming;
  const agentMessages = chat.messages;
  // Nycklat på senaste radens id, inte på hela listan: strömchunkar till samma
  // svar ska inte starta om effekten, men en NY rad (användaren skrev igen)
  // avbryter en pågående hämtning — då gäller den nya frågan.
  const lastAgentMessageId = agentMessages[agentMessages.length - 1]?.id ?? null;
  const agentMessagesRef = useRef(agentMessages);
  useEffect(() => {
    agentMessagesRef.current = agentMessages;
  }, [agentMessages]);
  useEffect(() => {
    if (agentStreaming || !chatId || !lastAgentMessageId) return;
    const agentMessagesNow = agentMessagesRef.current;
    const last = agentMessagesNow[agentMessagesNow.length - 1];
    if (!last || last.id !== lastAgentMessageId) return;
    if (last.role !== "assistant" || last.hydrated || last.delivery === "interrupted" ||
        last.delivery === "streaming") return;
    if (handledReadIdsRef.current.has(last.id) || inFlightReadIdRef.current === last.id) return;
    const parsed = parseOpenClawMessage(last.content);
    if (parsed.action?.type !== "read_files") return;
    const action = parsed.action;
    const agentMessages = agentMessagesNow;

    // Rundräknare nollställs vid varje riktig användarfråga.
    let lastUserChatId: string | null = null;
    for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
      const candidate = agentMessages[index];
      if (candidate.role === "user" && classifyAgentMessage(candidate) === "chat") {
        lastUserChatId = candidate.id;
        break;
      }
    }
    if (readRoundsRef.current.userMessageId !== lastUserChatId) {
      readRoundsRef.current = { userMessageId: lastUserChatId, rounds: 0, limitSent: false };
    }
    const internalOptions: OpenClawSendOptions = {
      allowArming: false,
      countTowardCampaignQuota: false,
      internal: true,
    };
    if (readRoundsRef.current.rounds >= READ_FILES_MAX_ROUNDS) {
      // Taket sägs en gång per fråga; därefter ignoreras fler läsförfrågningar
      // tills användaren skriver något nytt.
      handledReadIdsRef.current.add(last.id);
      if (!readRoundsRef.current.limitSent) {
        readRoundsRef.current.limitSent = true;
        void sendRef.current(buildReadFilesLimitTurn(), internalOptions);
      }
      return;
    }

    const versionId = last.builderTarget?.versionId ?? activeVersionIdRef.current;
    let cancelled = false;
    inFlightReadIdRef.current = last.id;
    void (async () => {
      let files: ReadableFile[] = [];
      try {
        const url = versionId
          ? `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(versionId)}`
          : `${engineChatBaseUrl(chatId)}/files`;
        const res = await fetch(url);
        const data = (await res.json().catch(() => null)) as {
          files?: Array<{ name?: unknown; content?: unknown }>;
        } | null;
        if (res.ok && Array.isArray(data?.files)) {
          files = data.files
            .filter(
              (file): file is { name: string; content: string } =>
                typeof file.name === "string" && typeof file.content === "string",
            )
            .map((file) => ({ name: file.name, content: file.content }));
        }
      } catch {
        // tomt → turen säger att inget kunde läsas
      } finally {
        if (inFlightReadIdRef.current === last.id) inFlightReadIdRef.current = null;
      }
      if (cancelled || chatIdRef.current !== chatId) return;
      const turn = buildReadFilesTurn(selectRequestedFiles(files, action.paths));
      // Hanterat och räknat först när turen faktiskt nått servern: ett utskick
      // som aldrig startade (agenten hann börja strömma igen) lämnar svaret
      // obehandlat så nästa effekt kan försöka om.
      void sendRef.current(turn, {
        ...internalOptions,
        onDispatchOutcome: (outcome) => {
          if (outcome === "not-started") return;
          handledReadIdsRef.current.add(last.id);
          readRoundsRef.current.rounds += 1;
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [lastAgentMessageId, agentStreaming, chatId]);

  // «Nästa bästa steg» efter ett bygge (E6). Ren beslutsmodul; här finns bara
  // strömkanterna och utskicket. En väckning kräver att en builder-ström setts
  // i chatten och att den gav en ny version — samma regel som continuation.
  const lastDigestVersionIdRef = useRef<string | null>(null);
  const streamTrackRef = useRef<{
    chatId: string | null;
    wasStreaming: boolean;
    streamed: boolean;
    versionIdAtStreamStart: string | null;
  }>({ chatId, wasStreaming: false, streamed: false, versionIdAtStreamStart: null });
  useEffect(() => {
    const track = streamTrackRef.current;
    if (track.chatId !== chatId) {
      track.chatId = chatId;
      track.wasStreaming = false;
      track.streamed = false;
      track.versionIdAtStreamStart = null;
      lastDigestVersionIdRef.current = null;
    }
    if (isAnyStreaming && !track.wasStreaming) {
      track.streamed = true;
      track.versionIdAtStreamStart = activeVersionId;
    }
    track.wasStreaming = isAnyStreaming;

    if (!available) return;
    const next: PostBuildDigestSnapshot = {
      chatId,
      activeVersionId,
      versionStatus: activeVersionStatus,
      versionIsLatest: activeVersionIsLatest,
      isStreaming: isAnyStreaming,
    };
    const live = useOpenClawStore.getState();
    const decision = decidePostBuildDigest({
      next,
      enabled: digestEnabled,
      agentStreaming: live.isStreaming,
      continuationActive: live.armedContinuation !== null,
      lastDigestVersionId: lastDigestVersionIdRef.current,
      streamedSinceLastDigest: track.streamed,
      versionIdAtStreamStart: track.versionIdAtStreamStart,
    });
    if (decision.kind !== "digest") return;
    lastDigestVersionIdRef.current = decision.versionId;
    track.streamed = false;
    void sendRef.current(buildPostBuildDigestPrompt({ versionStatus: decision.versionStatus }), {
      allowArming: false,
      countTowardCampaignQuota: false,
      internal: true,
    });
  }, [
    available,
    chatId,
    activeVersionId,
    activeVersionStatus,
    activeVersionIsLatest,
    isAnyStreaming,
    digestEnabled,
  ]);

  const value = useMemo<SajtagentContextValue>(
    () => ({
      available,
      messages: chat.messages,
      isStreaming: chat.isStreaming,
      send,
      stop: chat.stop,
      clearConversation: chat.clearConversation,
      armedMandate,
      campaignScript,
    }),
    [available, chat.messages, chat.isStreaming, chat.stop, chat.clearConversation, send, armedMandate, campaignScript],
  );

  return <SajtagentContext.Provider value={value}>{children}</SajtagentContext.Provider>;
}
