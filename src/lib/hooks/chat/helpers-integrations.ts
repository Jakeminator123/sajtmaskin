import type { UiMessagePart } from "@/lib/builder/types";
import {
  isGenericIntegrationName,
  normalizeIntegrationIdentity,
  resolveIntegrationDisplayName,
} from "@/lib/integrations/suggestion-display";
import type { IntegrationSseSignal } from "./types";

export function coerceIntegrationSignals(data: unknown): IntegrationSseSignal[] {
  const rawItems =
    Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)
        ? (data as { items: unknown[] }).items
        : data && typeof data === "object"
          ? [data]
          : [];

  const parsed = rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const signal = item as Record<string, unknown>;
      const envVars = Array.isArray(signal.envVars)
        ? signal.envVars.map((value) => String(value)).filter(Boolean)
        : [];
      return {
        key: typeof signal.key === "string" ? signal.key : undefined,
        name: typeof signal.name === "string" ? signal.name : undefined,
        provider: typeof signal.provider === "string" ? signal.provider : undefined,
        status: typeof signal.status === "string" ? signal.status : undefined,
        intent:
          signal.intent === "install" ||
          signal.intent === "connect" ||
          signal.intent === "configure" ||
          signal.intent === "env_vars"
            ? signal.intent
            : undefined,
        envVars: envVars.length > 0 ? envVars : undefined,
        marketplaceUrl:
          typeof signal.marketplaceUrl === "string" ? signal.marketplaceUrl : undefined,
        sourceEvent: typeof signal.sourceEvent === "string" ? signal.sourceEvent : undefined,
      } as IntegrationSseSignal;
    })
    .filter((item): item is IntegrationSseSignal => Boolean(item));

  return mergeIntegrationSignalsByProvider(parsed);
}

const KNOWN_PROVIDERS = [
  "supabase", "neon", "upstash", "redis", "stripe", "openai",
  "elevenlabs", "resend", "twilio", "sendgrid", "clerk", "auth0",
  "firebase", "mongodb", "planetscale", "turso", "drizzle",
  "prisma", "convex", "appwrite", "sanity", "contentful",
];

function stableIntegrationSignalKey(signal: IntegrationSseSignal): string {
  const payload = JSON.stringify({
    key: signal.key,
    name: signal.name,
    provider: signal.provider,
    status: signal.status,
    intent: signal.intent,
    envVars: signal.envVars,
  });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function deriveProviderKey(signal: IntegrationSseSignal): string {
  // Identity form (compact, camelCase-säker): "OpenAI" → "openai" så samma
  // provider aldrig får två olika dedupe-nycklar (Vercel Agent-fynd PR #375).
  const provider = normalizeIntegrationIdentity(signal.provider);
  if (provider) {
    const match = KNOWN_PROVIDERS.find((k) => provider.includes(k));
    if (match) return match;
    return provider;
  }

  const name = signal.name?.trim() ?? "";
  const normalizedName = normalizeIntegrationIdentity(name) ?? "";
  if (normalizedName && !isGenericIntegrationName(normalizedName)) {
    for (const known of KNOWN_PROVIDERS) {
      if (normalizedName.includes(known)) return known;
    }
  }

  const envHint = normalizeIntegrationIdentity(signal.envVars?.join(" ") ?? "") ?? "";
  for (const known of KNOWN_PROVIDERS) {
    if (envHint.includes(known)) return known;
  }

  if (signal.key) {
    const normalizedKey = normalizeIntegrationIdentity(signal.key);
    if (normalizedKey) return normalizedKey;
    return signal.key;
  }
  if (normalizedName && !isGenericIntegrationName(normalizedName)) {
    return normalizedName;
  }
  if (signal.envVars && signal.envVars.length > 0) {
    return `env:${signal.envVars.sort().join(",")}`;
  }
  return `signal:${stableIntegrationSignalKey(signal)}`;
}

function mergeIntegrationSignalsByProvider(
  signals: IntegrationSseSignal[],
): IntegrationSseSignal[] {
  if (signals.length <= 1) return signals;

  const groups = new Map<string, IntegrationSseSignal[]>();
  for (const signal of signals) {
    const key = deriveProviderKey(signal);
    const group = groups.get(key);
    if (group) {
      group.push(signal);
    } else {
      groups.set(key, [signal]);
    }
  }

  const merged: IntegrationSseSignal[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const allEnvVars = new Set<string>();
    let bestName: string | undefined;
    let bestProvider: string | undefined;
    let bestStatus: string | undefined;
    let bestIntent: IntegrationSseSignal["intent"];
    let bestMarketplaceUrl: string | undefined;
    let bestSourceEvent: string | undefined;

    for (const s of group) {
      if (s.name && !bestName) bestName = s.name;
      if (s.provider && !bestProvider) bestProvider = s.provider;
      if (s.status && !bestStatus) bestStatus = s.status;
      if (s.intent && !bestIntent) bestIntent = s.intent;
      if (s.marketplaceUrl && !bestMarketplaceUrl) bestMarketplaceUrl = s.marketplaceUrl;
      if (s.sourceEvent && !bestSourceEvent) bestSourceEvent = s.sourceEvent;
      if (s.envVars) s.envVars.forEach((v) => allEnvVars.add(v));
    }

    const envArr = [...allEnvVars].filter((v) => /^[A-Z][A-Z0-9_]+$/.test(v));
    const mergedKey = bestProvider ?? bestName ?? group[0].key;
    merged.push({
      key: mergedKey ? `merged:${mergedKey}` : group[0].key,
      name: bestName,
      provider: bestProvider,
      status: bestStatus,
      intent: bestIntent,
      envVars: envArr.length > 0 ? envArr : undefined,
      marketplaceUrl: bestMarketplaceUrl,
      sourceEvent: bestSourceEvent,
    });
  }

  return merged;
}

function buildIntegrationSteps(signal: IntegrationSseSignal): string[] {
  const steps: string[] = [];
  const displayName = resolveIntegrationDisplayName({
    provider: signal.provider,
    name: signal.name,
    key: signal.key,
  });
  if (displayName) {
    steps.push(`Integration: ${displayName}`);
  }
  if (signal.intent) {
    const label =
      signal.intent === "env_vars"
        ? "Konfigurera miljövariabler"
        : signal.intent === "install"
          ? "Installera"
          : signal.intent === "connect"
            ? "Koppla"
            : "Konfigurera";
    steps.push(`Åtgärd: ${label}`);
  }
  if (signal.envVars && signal.envVars.length > 0) {
    const realKeys = signal.envVars.filter((v) => /^[A-Z][A-Z0-9_]+$/.test(v));
    if (realKeys.length > 0) {
      steps.push(`Miljövariabler: ${realKeys.join(", ")}`);
    }
  }
  if (signal.status) {
    steps.push(`Status: ${signal.status}`);
  }
  return steps;
}

export function integrationSignalToToolPart(
  signal: IntegrationSseSignal,
  fallbackId: string,
): UiMessagePart {
  const toolCallId = signal.key ? `integration:${signal.key}` : `integration:${fallbackId}`;
  return {
    type: "tool:integration-suggestion",
    toolName: "Integration suggestion",
    toolCallId,
    state: "output-available",
    output: {
      ...signal,
      steps: buildIntegrationSteps(signal),
    },
  } as UiMessagePart;
}
