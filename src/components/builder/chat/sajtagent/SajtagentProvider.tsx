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

  // Befogenheter per chatt (default-på för en ny builderchatt, se
  // `persist-openclaw-powers.ts`). Körs när chatten eller env-grinden ändras;
  // `editEnabled` blir bara sant efter en lyckad health-koll, så inget anrop
  // sker på en deploy utan ytan.
  useEffect(() => {
    if (!chatId || !editEnabled) return;
    void hydrateOpenClawPowersForChat(chatId);
  }, [chatId, editEnabled]);

  // Beständig historik: fyll på storen när en chatt öppnas — först när ytan
  // bekräftats, så builderns egen laddning (projekt, versioner, filer) inte
  // konkurrerar med ett agentanrop som ändå inte används. Scope-bytet i
  // `OpenClawChat` har redan tömt minnet för den förra chatten.
  const chatIdRef = useRef(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);
  useEffect(() => {
    if (!chatId || !available) return;
    void hydrateAgentHistory(chatId, () => chatIdRef.current === chatId);
  }, [chatId, available]);

  // Varje avslutad tur (inklusive nästlade väckningar som sker inuti `send`)
  // skrivs ner — bara det som faktiskt fick innehåll.
  const send = useCallback(
    async (text: string, options?: OpenClawSendOptions) => {
      const chatAtSend = chatIdRef.current;
      const before = useOpenClawStore.getState().messages.length;
      try {
        await chat.send(text, options);
      } finally {
        if (chatAtSend && chatIdRef.current === chatAtSend) {
          const after = useOpenClawStore.getState().messages.slice(before);
          if (after.length > 0) void persistAgentMessages(chatAtSend, after);
        }
      }
    },
    [chat],
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
  const handledReadIdsRef = useRef<Set<string>>(new Set());
  const readRoundsRef = useRef<{ userMessageId: string | null; rounds: number }>({
    userMessageId: null,
    rounds: 0,
  });
  const agentStreaming = chat.isStreaming;
  const agentMessages = chat.messages;
  useEffect(() => {
    if (agentStreaming || !chatId) return;
    const last = agentMessages[agentMessages.length - 1];
    if (!last || last.role !== "assistant" || last.hydrated) return;
    if (handledReadIdsRef.current.has(last.id)) return;
    const parsed = parseOpenClawMessage(last.content);
    if (parsed.action?.type !== "read_files") return;
    handledReadIdsRef.current.add(last.id);
    const action = parsed.action;

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
      readRoundsRef.current = { userMessageId: lastUserChatId, rounds: 0 };
    }
    const internalOptions: OpenClawSendOptions = {
      allowArming: false,
      countTowardCampaignQuota: false,
      internal: true,
    };
    if (readRoundsRef.current.rounds >= READ_FILES_MAX_ROUNDS) {
      void sendRef.current(buildReadFilesLimitTurn(), internalOptions);
      return;
    }
    readRoundsRef.current.rounds += 1;

    const versionId = last.builderTarget?.versionId ?? activeVersionId;
    let cancelled = false;
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
      }
      if (cancelled || chatIdRef.current !== chatId) return;
      const turn = buildReadFilesTurn(selectRequestedFiles(files, action.paths));
      void sendRef.current(turn, internalOptions);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentMessages, agentStreaming, chatId, activeVersionId]);

  // «Nästa bästa steg» efter ett bygge (E6). Ren beslutsmodul; här finns bara
  // ögonblicksbilderna och utskicket.
  const prevSnapshotRef = useRef<PostBuildDigestSnapshot | null>(null);
  const lastDigestVersionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const next: PostBuildDigestSnapshot = {
      chatId,
      activeVersionId,
      versionStatus: activeVersionStatus,
      versionIsLatest: activeVersionIsLatest,
      isStreaming: isAnyStreaming,
    };
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = next;
    if (!available) return;
    const live = useOpenClawStore.getState();
    const decision = decidePostBuildDigest({
      prev,
      next,
      enabled: digestEnabled,
      agentStreaming: live.isStreaming,
      continuationActive: live.armedContinuation !== null,
      lastDigestVersionId: lastDigestVersionIdRef.current,
    });
    if (decision.kind !== "digest") return;
    lastDigestVersionIdRef.current = decision.versionId;
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
