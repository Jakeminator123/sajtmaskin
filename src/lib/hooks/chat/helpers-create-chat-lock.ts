import { CREATE_CHAT_LOCK_KEY, CREATE_CHAT_LOCK_TTL_MS } from "./constants";
import type { CreateChatLock } from "./types";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCreateChatLock(): CreateChatLock | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CREATE_CHAT_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateChatLock;
    if (!parsed || typeof parsed.key !== "string" || typeof parsed.createdAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreateChatLock(lock: CreateChatLock) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(CREATE_CHAT_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // ignore storage errors
  }
}

export function clearCreateChatLock() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(CREATE_CHAT_LOCK_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getActiveCreateChatLock(key: string): CreateChatLock | null {
  const lock = readCreateChatLock();
  if (!lock) return null;
  if (Date.now() - lock.createdAt > CREATE_CHAT_LOCK_TTL_MS) {
    clearCreateChatLock();
    return null;
  }
  return lock.key === key ? lock : null;
}

export function updateCreateChatLockChatId(key: string, chatId: string) {
  const lock = readCreateChatLock();
  if (!lock || lock.key !== key) return;
  if (lock.chatId === chatId) return;
  writeCreateChatLock({ ...lock, chatId });
}
