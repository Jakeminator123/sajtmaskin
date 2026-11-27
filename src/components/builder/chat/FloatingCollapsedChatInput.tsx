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
  /** Byter chattpanelen mot byggkuben; knappen sitter i raden ovanför inmatningen. */
  onOpenCube?: () => void;
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
  onOpenCube,
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

  const floatStyle: CSSProperties | undefined = floatActive
    ? {
        position: "fixed",
        width: FLOAT_WIDTH,
        zIndex: 40,
        // The initial placement is visible before a saved position is measured.
        ...(position
          ? { left: position.x, top: position.y }
          : { left: "50%", bottom: "1rem", transform: "translateX(-50%)" }),
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
    >
      {messageCount > 0 || onOpenCube ? (
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
          onOpenCube={onOpenCube}
        />
      ) : null}
      {/* Flytande läge: lägre textruta så kortet tar mindre av sajten. */}
      <div className={cn(floatActive && "[&_textarea]:min-h-12")}>
        {children}
      </div>
    </div>
  );
}
