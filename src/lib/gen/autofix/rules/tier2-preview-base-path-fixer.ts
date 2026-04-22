/**
 * Mechanical fixer: inject a conditional `basePath` into `next.config.ts`
 * so the generated app respects `SAJTMASKIN_PREVIEW_BASE_PATH` when mounted
 * behind the tier-2 preview proxy.
 *
 * Extracted from `src/lib/gen/autofix/pipeline.ts` 2026-04-21.
 */

const NEXT_CONFIG_FILE_RE = /(^|\/)next\.config\.(ts|mts)$/i;

export function ensureTier2PreviewBasePathInNextConfig(
  code: string,
  filePath: string,
): { code: string; fixed: boolean } {
  if (!NEXT_CONFIG_FILE_RE.test(filePath.replace(/\\/g, "/"))) {
    return { code, fixed: false };
  }
  if (code.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { code, fixed: false };
  }
  if (/\bbasePath\s*:/.test(code)) {
    return { code, fixed: false };
  }
  const re = /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/;
  if (!re.test(code)) {
    return { code, fixed: false };
  }
  const nextCode = code.replace(
    re,
    `$1\n  ...(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim()\n    ? { basePath: process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim() }\n    : {}),`,
  );
  return { code: nextCode, fixed: nextCode !== code };
}
