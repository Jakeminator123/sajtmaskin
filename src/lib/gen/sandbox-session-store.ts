/**
 * In-memory registry of last successful sandbox preview per `chatId`.
 * VM reuse is not implemented; this supports observability and future reuse.
 */

export type SandboxSessionEntry = {
  sandboxId: string;
  sandboxUrl: string;
  createdAt: number;
  lastUsedAt: number;
};

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_HARD_CAP_MS = 2 * 60 * 60 * 1000;

const sessions = new Map<string, SandboxSessionEntry>();

function isExpired(entry: SandboxSessionEntry, now: number, idleMs: number, hardCapMs: number): boolean {
  if (now - entry.createdAt > hardCapMs) return true;
  if (now - entry.lastUsedAt > idleMs) return true;
  return false;
}

export type TouchSandboxSessionParams = {
  chatId: string;
  sandboxId: string;
  sandboxUrl: string;
  now?: number;
};

export function touchSandboxSession(params: TouchSandboxSessionParams): void {
  const now = params.now ?? Date.now();
  const prev = sessions.get(params.chatId);
  sessions.set(params.chatId, {
    sandboxId: params.sandboxId,
    sandboxUrl: params.sandboxUrl,
    createdAt: prev?.sandboxId === params.sandboxId ? prev.createdAt : now,
    lastUsedAt: now,
  });
}

export type GetSandboxSessionOptions = {
  now?: number;
  idleMs?: number;
  hardCapMs?: number;
};

export function getActiveSandboxSession(
  chatId: string,
  options?: GetSandboxSessionOptions,
): SandboxSessionEntry | null {
  const now = options?.now ?? Date.now();
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const hardCapMs = options?.hardCapMs ?? DEFAULT_HARD_CAP_MS;
  const entry = sessions.get(chatId);
  if (!entry) return null;
  if (isExpired(entry, now, idleMs, hardCapMs)) {
    sessions.delete(chatId);
    return null;
  }
  return entry;
}

export function bumpSandboxSessionActivity(chatId: string, now?: number): void {
  const t = now ?? Date.now();
  const entry = getActiveSandboxSession(chatId, { now: t });
  if (!entry) return;
  entry.lastUsedAt = t;
  sessions.set(chatId, entry);
}

export function clearSandboxSession(chatId: string): void {
  sessions.delete(chatId);
}

/** @internal */
export function resetSandboxSessionStoreForTests(): void {
  sessions.clear();
}

export const SANDBOX_SESSION_IDLE_MS = DEFAULT_IDLE_MS;
export const SANDBOX_SESSION_HARD_CAP_MS = DEFAULT_HARD_CAP_MS;
