export { sanitizeOutput, type SanitizeResult, type SanitizeWarning } from "./output-sanitizer";
export { validateFilePath, sanitizeFilePath } from "./path-validator";
export { checkPromptInjection } from "./prompt-guard";

import { sanitizeOutput, type SanitizeWarning } from "./output-sanitizer";
import { checkPromptInjection } from "./prompt-guard";

export interface SecurityCheckResult {
  safe: boolean;
  sanitizedContent: string;
  warnings: SanitizeWarning[];
  blockedFiles: string[];
  injectionIndicators: string[];
}

export function runSecurityChecks(content: string): SecurityCheckResult {
  const sanitizeResult = sanitizeOutput(content);
  const injectionResult = checkPromptInjection(sanitizeResult.sanitized);

  const hasBlocks = sanitizeResult.blockedFiles.length > 0;

  return {
    safe: !hasBlocks,
    sanitizedContent: sanitizeResult.sanitized,
    warnings: sanitizeResult.warnings,
    blockedFiles: sanitizeResult.blockedFiles,
    injectionIndicators: injectionResult.indicators,
  };
}
