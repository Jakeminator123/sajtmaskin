type IntegrationIdentityInput = {
  provider?: string | null;
  name?: string | null;
  key?: string | null;
};

const GENERIC_INTEGRATION_NAME_KEYS = new Set([
  "integration",
  "integrations",
  "integrationsuggestion",
  "unknown",
  "provider",
]);

const DISPLAY_TOKEN_OVERRIDES: Record<string, string> = {
  ai: "AI",
  api: "API",
  db: "DB",
  id: "ID",
  kv: "KV",
  oauth: "OAuth",
  sdk: "SDK",
  sms: "SMS",
  sql: "SQL",
  ui: "UI",
  url: "URL",
  ux: "UX",
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isGenericIntegrationName(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return GENERIC_INTEGRATION_NAME_KEYS.has(compactName(normalized));
}

export function normalizeIntegrationProviderKey(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const slug = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || null;
}

function displayToken(token: string): string {
  const override = DISPLAY_TOKEN_OVERRIDES[token];
  if (override) return override;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function deriveIntegrationNameFromProvider(
  provider: string | null | undefined,
): string | null {
  const normalized = normalizeIntegrationProviderKey(provider);
  if (!normalized) return null;
  const tokens = normalized.split("-").filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map(displayToken).join(" ");
}

export function resolveIntegrationIdentityKey(
  input: IntegrationIdentityInput,
): string | null {
  const providerKey = normalizeIntegrationProviderKey(input.provider);
  if (providerKey) return providerKey;

  const key = normalizeIntegrationProviderKey(input.key);
  if (key && !isGenericIntegrationName(key)) return key;

  if (!isGenericIntegrationName(input.name)) {
    return normalizeIntegrationProviderKey(input.name);
  }
  return null;
}

export function resolveIntegrationDisplayName(
  input: IntegrationIdentityInput,
): string | null {
  const name = normalizeText(input.name);
  if (name && !isGenericIntegrationName(name)) {
    return name;
  }

  const providerLabel = deriveIntegrationNameFromProvider(input.provider ?? input.key);
  if (providerLabel && !isGenericIntegrationName(providerLabel)) {
    return providerLabel;
  }

  return null;
}
