export const providerKeys = ["openai", "replicate", "fireworks", "vertex"] as const;

export type ProviderKey = (typeof providerKeys)[number];

export function isProviderKey(value: string): value is ProviderKey {
  return providerKeys.includes(value as ProviderKey);
}
