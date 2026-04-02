"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GripHorizontal, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";

interface FloatingChatBoxProps {
  children: ReactNode;
  mobileVisible?: boolean;
  className?: string;
}

/**
 * Apple-minimalist floating chat wrapper for Amatör mode.
 *
 * Mobile (< lg): renders as a normal full-width div, visibility
 * controlled by `mobileVisible` (for tab switching).
 *
 * Desktop (lg+): absolutely positioned frosted-glass box that can be
 * dragged freely across the entire screen. A collapse button minimizes
 * it to a small icon so the user can see the full preview.
 */
export function FloatingChatBox({ children, mobileVisible = true, className }: FloatingChatBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  const clampPosition = useCallback((x: number, y: number) => {
    const box = boxRef.current;
    const parent = box?.offsetParent as HTMLElement | null;
    if (!parent || !box) return { x, y };
    const margin = 8;
    return {
      x: Math.min(Math.max(x, margin), parent.clientWidth - box.offsetWidth - margin),
      y: Math.min(Math.max(y, margin), parent.clientHeight - box.offsetHeight - margin),
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const box = boxRef.current;
      if (!box) return;

      let currentX: number;
      let currentY: number;

      if (position) {
        currentX = position.x;
        currentY = position.y;
      } else {
        const parent = box.offsetParent as HTMLElement | null;
        const boxRect = box.getBoundingClientRect();
        const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
        currentX = boxRect.left - parentRect.left;
        currentY = boxRect.top - parentRect.top;
        setPosition({ x: currentX, y: currentY });
      }

      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: currentX,
        startPosY: currentY,
      };
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const { startX, startY, startPosX, startPosY } = dragStartRef.current;
      const newPos = clampPosition(
        startPosX + (e.clientX - startX),
        startPosY + (e.clientY - startY),
      );
      setPosition(newPos);
    },
    [clampPosition],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  if (isMinimized) {
    return (
      <>
        {/* Mobile: still show full panel */}
        <div className={cn("flex min-h-0 w-full flex-col lg:hidden", mobileVisible ? "flex" : "hidden")}>
          {children}
        </div>
        {/* Desktop: collapsed pill */}
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className={cn(
            "hidden lg:flex",
            "absolute left-4 top-1/2 z-30 -translate-y-1/2",
            "h-12 w-12 items-center justify-center",
            "rounded-full border border-border/30 bg-background/90 backdrop-blur-xl",
            "text-primary shadow-lg transition-all hover:scale-105 hover:shadow-xl",
            "animate-chat-shadow-pulse",
          )}
          aria-label="Öppna chatten"
          title="Öppna chatten"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      </>
    );
  }

  return (
    <div
      ref={boxRef}
      style={
        position
          ? { left: position.x, top: position.y, transform: "none" }
          : undefined
      }
      className={cn(
        "bg-background min-h-0 w-full flex-col",
        mobileVisible ? "flex" : "hidden",
        "lg:pointer-events-auto lg:absolute lg:z-30 lg:flex lg:w-80",
        "lg:h-[540px] lg:overflow-hidden",
        "lg:rounded-2xl lg:border lg:border-border/30 lg:bg-background/90 lg:backdrop-blur-xl",
        "lg:transition-shadow lg:duration-300",
        "lg:animate-chat-shadow-pulse",
        !position && "lg:left-4 lg:top-1/2 lg:-translate-y-1/2",
        isDragging && "lg:shadow-2xl lg:animate-none",
        className,
      )}
    >
      {/* Top bar: drag handle + minimize — desktop only */}
      <div className="hidden shrink-0 items-center lg:flex">
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground/50 transition-colors hover:text-foreground"
          aria-label="Minimera chatten"
          title="Minimera"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn(
            "flex flex-1 items-center justify-center py-1.5",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ touchAction: "none" }}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground/40" />
        </div>
        <div className="w-8" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2 pb-3 lg:pt-0 lg:pb-2">{children}</div>
    </div>
  );
}
