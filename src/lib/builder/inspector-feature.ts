import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

const DISABLED_VALUES = new Set(["0", "false", "no", "n", "off"]);
const DISABLED_MESSAGE = "Builder inspector är avstängd via feature flag.";

function parseOptionalInspectorFlag(value: string | undefined): boolean | null {
  const normalized = sanitizeEnvString(value)?.toLowerCase();
  if (!normalized) return null;
  if (isAffirmativeEnvValue(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  return null;
}

export function isBuilderInspectorEnabled(): boolean {
  const publicFlag = parseOptionalInspectorFlag(process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR);
  if (publicFlag !== null) return publicFlag;

  const serverFlag = parseOptionalInspectorFlag(process.env.SAJTMASKIN_BUILDER_INSPECTOR);
  if (serverFlag !== null) return serverFlag;

  return true;
}

export function getBuilderInspectorDisabledMessage(): string {
  return DISABLED_MESSAGE;
}
