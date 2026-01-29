"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description?: string;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {},
) {
  const { enabled = true, preventDefault = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (event.key !== "Escape") {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const altMatch = !!shortcut.alt === event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (preventDefault) {
            event.preventDefault();
          }
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts, enabled, preventDefault],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export function useBuilderShortcuts(handlers: {
  onNewChat?: () => void;
  onSend?: () => void;
  onDeploy?: () => void;
  onToggleSidebar?: () => void;
  onRefreshPreview?: () => void;
  onEscape?: () => void;
}) {
  const shortcuts: KeyboardShortcut[] = [
    ...(handlers.onNewChat
      ? [
          {
            key: "n",
            ctrl: true,
            action: handlers.onNewChat,
            description: "Create new chat",
          },
        ]
      : []),
    ...(handlers.onSend
      ? [
          {
            key: "Enter",
            ctrl: true,
            action: handlers.onSend,
            description: "Send message",
          },
        ]
      : []),
    ...(handlers.onDeploy
      ? [
          {
            key: "d",
            ctrl: true,
            action: handlers.onDeploy,
            description: "Deploy current version",
          },
        ]
      : []),
    ...(handlers.onToggleSidebar
      ? [
          {
            key: "b",
            ctrl: true,
            action: handlers.onToggleSidebar,
            description: "Toggle sidebar",
          },
        ]
      : []),
    ...(handlers.onRefreshPreview
      ? [
          {
            key: "r",
            ctrl: true,
            action: handlers.onRefreshPreview,
            description: "Refresh preview",
          },
        ]
      : []),
    ...(handlers.onEscape
      ? [
          {
            key: "Escape",
            action: handlers.onEscape,
            description: "Close/Cancel",
          },
        ]
      : []),
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}

export function getShortcutDisplay(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.ctrl) {
    parts.push(
      typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl",
    );
  }
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt) parts.push("Alt");

  parts.push(shortcut.key.toUpperCase());

  return parts.join("+");
}
