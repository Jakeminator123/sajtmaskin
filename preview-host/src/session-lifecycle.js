"use strict";

// Chat workspaces are single-host resources. This process-local queue orders
// every destructive cleanup and mutation for one chat. It is intentionally not
// a distributed lock and does not claim multi-host safety.
const lifecycleTailByChat = new Map();

function withChatLifecycleLock(chatId, operation) {
  const key = typeof chatId === "string" ? chatId.trim() : "";
  if (!key) return operation();
  const previous = lifecycleTailByChat.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const tail = run.catch(() => undefined);
  lifecycleTailByChat.set(key, tail);
  tail.then(() => {
    if (lifecycleTailByChat.get(key) === tail) lifecycleTailByChat.delete(key);
  });
  return run;
}

function matchesLifecycleToken(session, lifecycleToken) {
  const stored =
    typeof session?.lifecycleToken === "string" && session.lifecycleToken.trim()
      ? session.lifecycleToken.trim()
      : null;
  // Rollout compatibility: sessions created by the old host carry no token.
  // New token-bearing sessions are strict, including when an old app omits it.
  return stored === null || stored === lifecycleToken;
}

function readMutationRevision(session) {
  const revision = Number(session?.mutationRevision);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

/**
 * Host-authoritative ordering receipt for persisted session mutations.
 * Store-lock callers assign this atomically with the mutation; app clocks are
 * deliberately not part of the ordering contract.
 */
function nextMutationRevision(data, chatId, session) {
  if (!data.mutationRevisionByChat || typeof data.mutationRevisionByChat !== "object") {
    data.mutationRevisionByChat = {};
  }
  const persisted = Number(data.mutationRevisionByChat[chatId]);
  const persistedRevision = Number.isSafeInteger(persisted) && persisted > 0 ? persisted : 0;
  const next = Math.max(persistedRevision, readMutationRevision(session) ?? 0) + 1;
  data.mutationRevisionByChat[chatId] = next;
  return next;
}

module.exports = {
  matchesLifecycleToken,
  nextMutationRevision,
  readMutationRevision,
  withChatLifecycleLock,
};
