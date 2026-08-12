/**
 * Per-chat position for the floating collapsed chat composer (desktop).
 * Same localStorage pattern as `chat-output-collapse.ts`: workspace preference,
 * not project data.
 */
const CHAT_INPUT_FLOAT_POS_PREFIX = "sajtmaskin:chatInputFloatPos:";

export type ChatInputFloatPosition = { x: number; y: number };

export type ChatInputFloatBoxSize = { width: number; height: number };

export type ChatInputFloatViewport = { width: number; height: number };

function buildKey(chatId: string): string {
  return `${CHAT_INPUT_FLOAT_POS_PREFIX}${chatId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampChatInputFloatPosition(
  pos: ChatInputFloatPosition,
  box: ChatInputFloatBoxSize,
  viewport: ChatInputFloatViewport,
  margin = 8,
): ChatInputFloatPosition {
  const maxX = Math.max(margin, viewport.width - box.width - margin);
  const maxY = Math.max(margin, viewport.height - box.height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y)),
  };
}

/** Default: horizontally centered near the bottom of the viewport. */
export function defaultChatInputFloatPosition(
  box: ChatInputFloatBoxSize,
  viewport: ChatInputFloatViewport,
  margin = 16,
): ChatInputFloatPosition {
  return clampChatInputFloatPosition(
    {
      x: (viewport.width - box.width) / 2,
      y: viewport.height - box.height - margin,
    },
    box,
    viewport,
    margin,
  );
}

export function readChatInputFloatPosition(chatId: string | null): ChatInputFloatPosition | null {
  if (!chatId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(buildKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
    return { x: record.x, y: record.y };
  } catch {
    return null;
  }
}

export function writeChatInputFloatPosition(
  chatId: string | null,
  position: ChatInputFloatPosition,
): void {
  if (!chatId || typeof window === "undefined") return;
  try {
    localStorage.setItem(buildKey(chatId), JSON.stringify({ x: position.x, y: position.y }));
  } catch {
    // ignore storage errors
  }
}

export function clearChatInputFloatPosition(chatId: string | null): void {
  if (!chatId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(buildKey(chatId));
  } catch {
    // ignore storage errors
  }
}

/** Movement below this (px) stays a click / no-op; above starts a drag. */
export const CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX = 4;
