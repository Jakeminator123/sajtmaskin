"use strict";

// Internal safety bound, intentionally not an operator env. Changing resource
// policy belongs in reviewed code so host/app rollout remains one contract.
const MAX_PREWARM_LEASES = 4096;

function normalizePrewarmLeaseKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function ensurePrewarmLeaseStore(data) {
  if (!data.prewarmLeases || typeof data.prewarmLeases !== "object" || Array.isArray(data.prewarmLeases)) {
    data.prewarmLeases = {};
  }
  return data.prewarmLeases;
}

function pruneExpiredPrewarmLeases(data, nowMs = Date.now()) {
  const leases = ensurePrewarmLeaseStore(data);
  let removed = 0;
  for (const [rawKey, lease] of Object.entries(leases)) {
    const key = normalizePrewarmLeaseKey(rawKey);
    const expiresAtMs = Date.parse(lease?.expiresAt ?? "");
    if (!key || key !== rawKey || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      delete leases[rawKey];
      removed += 1;
    }
  }
  return removed;
}

function acquirePrewarmLease(data, params) {
  const key = normalizePrewarmLeaseKey(params.key);
  if (!key) return { type: "invalid" };
  pruneExpiredPrewarmLeases(data, params.nowMs);
  const leases = ensurePrewarmLeaseStore(data);
  const existing = leases[key];
  if (existing && existing.chatId !== params.chatId) {
    return { type: "rate_limited", lease: existing };
  }
  const maxLeases =
    Number.isInteger(params.maxLeases) && params.maxLeases > 0
      ? params.maxLeases
      : MAX_PREWARM_LEASES;
  if (!existing && Object.keys(leases).length >= maxLeases) {
    return { type: "capacity" };
  }
  leases[key] = {
    chatId: params.chatId,
    expiresAt: new Date(params.nowMs + params.leaseMs).toISOString(),
  };
  return { type: existing ? "existing" : "acquired", key, lease: leases[key] };
}

function releasePrewarmLeaseForChat(data, chatId) {
  const leases = ensurePrewarmLeaseStore(data);
  let removed = 0;
  for (const [key, lease] of Object.entries(leases)) {
    if (lease?.chatId === chatId) {
      delete leases[key];
      removed += 1;
    }
  }
  return removed;
}

function resetPrewarmLeases(data) {
  const count = Object.keys(ensurePrewarmLeaseStore(data)).length;
  data.prewarmLeases = {};
  return count;
}

module.exports = {
  acquirePrewarmLease,
  ensurePrewarmLeaseStore,
  MAX_PREWARM_LEASES,
  normalizePrewarmLeaseKey,
  pruneExpiredPrewarmLeases,
  releasePrewarmLeaseForChat,
  resetPrewarmLeases,
};
