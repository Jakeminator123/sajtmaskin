export interface KostnadsfriOpenClawConfig {
  roleLabel?: string;
  introTitle?: string;
  introBody?: string;
  starterPrompts?: string[];
}

export interface KostnadsfriOpenClawSurfaceContext extends KostnadsfriOpenClawConfig {
  companyName: string;
}

function normalizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeStarterPrompts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const prompts = value
    .map((item) => normalizeString(item, 120))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  return prompts.length > 0 ? prompts : undefined;
}

export function normalizeKostnadsfriOpenClawConfig(
  value: unknown,
): KostnadsfriOpenClawConfig | null {
  if (!value || typeof value !== "object") return null;

  const config: KostnadsfriOpenClawConfig = {
    roleLabel: normalizeString((value as Record<string, unknown>).roleLabel, 80),
    introTitle: normalizeString((value as Record<string, unknown>).introTitle, 120),
    introBody: normalizeString((value as Record<string, unknown>).introBody, 320),
    starterPrompts: normalizeStarterPrompts((value as Record<string, unknown>).starterPrompts),
  };

  if (!config.roleLabel && !config.introTitle && !config.introBody && !config.starterPrompts) {
    return null;
  }

  return config;
}

export function extractKostnadsfriOpenClawConfig(
  extraData: Record<string, unknown> | null | undefined,
): KostnadsfriOpenClawConfig | null {
  if (!extraData) return null;
  return normalizeKostnadsfriOpenClawConfig(extraData.openclaw);
}
