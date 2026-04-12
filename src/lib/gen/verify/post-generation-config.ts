import { getAiModelsManifest } from "@/lib/ai-models/load-manifest";

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function resolvePostGenerationVerifierConfig(): {
  maxOutputTokens: number;
  timeoutMs: number;
  snippetCharsPerFile: number;
} {
  const p = getAiModelsManifest().postGenerationPasses;
  const t = p.verifierMaxOutputTokens;
  const tm = p.verifierTimeoutMs;
  const sn = p.verifierSnippetCharsPerFile;
  return {
    maxOutputTokens: readIntEnv(t.envKey, t.default, t.min, t.max),
    timeoutMs: readIntEnv(tm.envKey, tm.default, tm.min, tm.max),
    snippetCharsPerFile: readIntEnv(sn.envKey, sn.default, sn.min, sn.max),
  };
}
