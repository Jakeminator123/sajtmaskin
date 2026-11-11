"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ChatOutputCollapseBar } from "@/components/builder/chat/ChatOutputCollapseBar";
import { countVisibleConversationMessages } from "@/components/builder/chat/conversation-count";
import { useSajtagent } from "@/components/builder/chat/sajtagent/SajtagentProvider";
import type { ChatMessage } from "@/lib/builder/types";
import { useChatInputFloatPosition } from "@/components/builder/chat/useChatInputFloatPosition";
import {
  CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX,
  readChatInputFloatPosition,
  resolveFloatPlacementSeed,
} from "@/lib/builder/chat-input-float-position";
import { cn } from "@/lib/utils";

/** Matches Tailwind `lg` — float mode is desktop-only. */
const LG_UP_QUERY = "(min-width: 1024px)";
/** Flytande kortets bredd (förut 42rem, som täckte 22 % av förhandsvisningen). */
const FLOAT_WIDTH = "min(28rem, calc(100vw - 1rem))";

function useIsLgUp(): boolean {
  const [isLgUp, setIsLgUp] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(LG_UP_QUERY);
    const sync = () => setIsLgUp(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isLgUp;
}

interface FloatingCollapsedChatInputProps {
  /**
   * Collapsed chat requested float. Actual float also requires desktop (lg+);
   * below that the composer stays in normal document flow.
   */
  floatEnabled: boolean;
  chatId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /**
   * Byggmotorns meddelanden. Räknaren lägger till Sajtagentens rader från
   * providern, så den räknar samma tidslinje som `MessageList` visar.
   */
  builderMessages: ReadonlyArray<ChatMessage>;
  isStreaming: boolean;
  statusText?: string | null;
  children: ReactNode;
}

/**
 * Collapse bar + chat input. On desktop collapsed mode this becomes a fixed,
 * draggable card over the preview instead of a docked bottom strip.
 */
export function FloatingCollapsedChatInput({
  floatEnabled,
  chatId,
  isCollapsed,
  onToggleCollapse,
  builderMessages,
  isStreaming,
  statusText = null,
  children,
}: FloatingCollapsedChatInputProps) {
  const agentMessages = useSajtagent()?.messages;
  const messageCount = useMemo(
    () => countVisibleConversationMessages(builderMessages, agentMessages ?? []),
    [builderMessages, agentMessages],
  );
  const isLgUp = useIsLgUp();
  const floatActive = floatEnabled && isLgUp;
  const rootRef = useRef<HTMLDivElement>(null);
  // V-riggen 2026-11-11: det flytande kortet täckte 22 % av förhandsvisningen.
  // Kortet är nu smalare och kan fällas ihop till en liten knapp. Inmatningen
  // avmonteras aldrig, så utkast och bilagor ligger kvar.
  const [minimized, setMinimized] = useState(false);
  const isMinimized = floatActive && minimized;
  const restoreRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggleRef = useRef<"restore" | "input" | null>(null);
  // Ett nytt flytläge börjar alltid utfällt (state justeras under rendering,
  // inte i en effekt).
  const [prevFloatActive, setPrevFloatActive] = useState(floatActive);
  if (prevFloatActive !== floatActive) {
    setPrevFloatActive(floatActive);
    if (!floatActive) setMinimized(false);
  }
  useEffect(() => {
    const target = focusAfterToggleRef.current;
    focusAfterToggleRef.current = null;
    if (target === "restore") restoreRef.current?.focus();
    if (target === "input") rootRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [isMinimized]);
  const minimize = useCallback(() => {
    focusAfterToggleRef.current = "restore";
    setMinimized(true);
  }, []);
  const restore = useCallback(() => {
    focusAfterToggleRef.current = "input";
    setMinimized(false);
  }, []);
  const { position, setPosition } = useChatInputFloatPosition(chatId);
  const positionRef = useRef(position);
  useLayoutEffect(() => {
    positionRef.current = position;
  }, [position]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const readBox = useCallback(() => {
    const el = rootRef.current;
    if (!el) return null;
    const box = { width: el.offsetWidth, height: el.offsetHeight };
    if (box.width <= 0 || box.height <= 0) return null;
    return box;
  }, []);

  const ensurePlaced = useCallback(() => {
    const box = readBox();
    if (!box) return;
    // Seed only from THIS chat's storage (or default). Never reuse
    // positionRef from a previous chatId — that leaked placement across chats.
    const stored = readChatInputFloatPosition(chatId);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPosition(resolveFloatPlacementSeed(stored, box, viewport), box);
  }, [chatId, readBox, setPosition]);

  // Place / re-clamp when float engages or chat switches.
  useLayoutEffect(() => {
    if (!floatActive) return;
    ensurePlaced();
  }, [floatActive, chatId, ensurePlaced]);

  useEffect(() => {
    if (!floatActive) return;
    const onResize = () => ensurePlaced();
    window.addEventListener("resize", onResize);
    const el = rootRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && el
        ? new ResizeObserver(() => ensurePlaced())
        : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [floatActive, ensurePlaced]);

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!floatActive || !positionRef.current) return;
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;

      const current = positionRef.current;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: current.x,
        originY: current.y,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [floatActive],
  );

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved) {
        if (
          Math.abs(dx) < CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX &&
          Math.abs(dy) < CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        drag.moved = true;
      }
      const box = readBox();
      if (!box) return;
      setPosition({ x: drag.originX + dx, y: drag.originY + dy }, box);
    },
    [readBox, setPosition],
  );

  const handleDragEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // Hopfälld: knappen dockas i nedre vänstra hörnet i stället för att stanna
  // på kortets plats mitt över sajten (riggen 2026-11-11). Kortets sparade
  // position används igen när det fälls ut.
  const floatStyle: CSSProperties | undefined = isMinimized
    ? { position: "fixed", left: "1rem", bottom: "1rem", width: "auto", zIndex: 40 }
    : floatActive && position
      ? {
          position: "fixed",
          left: position.x,
          top: position.y,
          width: isMinimized ? "auto" : FLOAT_WIDTH,
          zIndex: 40,
        }
      : floatActive
        ? {
            // Pre-measure placeholder: bottom-center until placeDefault runs.
            position: "fixed",
            left: "50%",
            bottom: "1rem",
            transform: "translateX(-50%)",
            width: isMinimized ? "auto" : FLOAT_WIDTH,
            zIndex: 40,
          }
        : undefined;

  return (
    <div
      ref={rootRef}
      role={floatActive ? "complementary" : undefined}
      aria-label={floatActive ? "Flytande chattinput" : undefined}
      className={cn(
        "flex flex-col",
        isCollapsed && !floatActive && "mx-auto w-full max-w-2xl",
        floatActive &&
          "border-border bg-background pointer-events-auto max-w-md rounded-lg border shadow-lg",
      )}
      style={floatStyle}
      data-testid={floatActive ? "floating-collapsed-chat-input" : undefined}
      data-minimized={isMinimized || undefined}
    >
      {isMinimized ? (
        <button
          ref={restoreRef}
          type="button"
          onClick={restore}
          aria-label={`Visa inmatningen (${messageCount === 1 ? "1 meddelande" : `${messageCount} meddelanden`})`}
          className="text-foreground hover:bg-muted/50 focus-visible:ring-ring inline-flex h-9 max-w-xs items-center gap-2 rounded-lg px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          {isStreaming ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <MessageSquare className="size-3.5" aria-hidden="true" />
          )}
          <span>Skriv till chatten</span>
          {isStreaming ? (
            <span className="text-muted-foreground">· Bygger …</span>
          ) : statusText ? (
            <span className="text-muted-foreground truncate">· {statusText}</span>
          ) : null}
        </button>
      ) : messageCount > 0 ? (
        <ChatOutputCollapseBar
          isCollapsed={isCollapsed}
          onToggle={onToggleCollapse}
          messageCount={messageCount}
          isStreaming={isStreaming}
          statusText={statusText}
          dragEnabled={floatActive}
          onDragHandlePointerDown={handleDragStart}
          onDragHandlePointerMove={handleDragMove}
          onDragHandlePointerUp={handleDragEnd}
          onDragHandlePointerCancel={handleDragEnd}
          onMinimize={floatActive ? minimize : undefined}
        />
      ) : null}
      {/* Flytande läge: lägre textruta så kortet tar mindre av sajten. */}
      <div hidden={isMinimized} className={cn(floatActive && "[&_textarea]:min-h-12")}>
        {children}
      </div>
    </div>
  );
}
