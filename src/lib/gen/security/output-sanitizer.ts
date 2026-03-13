import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";

export interface SanitizeWarning {
  file: string;
  line: number;
  pattern: string;
  severity: "block" | "warn";
}

export interface SanitizeResult {
  sanitized: string;
  warnings: SanitizeWarning[];
  blockedFiles: string[];
}

interface PatternRule {
  regex: RegExp;
  label: string;
  severity: "block" | "warn";
}

const BLOCK_PATTERNS: PatternRule[] = [
  { regex: /\beval\s*\(/, label: "eval()", severity: "block" },
  { regex: /\bnew\s+Function\s*\(/, label: "new Function()", severity: "block" },
  { regex: /\bdocument\.write\s*\(/, label: "document.write()", severity: "block" },
  { regex: /<script\s+src\s*=\s*"http/, label: '<script src="http...">', severity: "block" },
];

const WARN_PATTERNS: PatternRule[] = [
  { regex: /dangerouslySetInnerHTML/, label: "dangerouslySetInnerHTML", severity: "warn" },
  { regex: /\.innerHTML\s*=\s*[^"'`]/, label: "innerHTML = (non-literal)", severity: "warn" },
];

const ALL_PATTERNS = [...BLOCK_PATTERNS, ...WARN_PATTERNS];

const BLOCKED_LINE_REPLACEMENT = "/* SECURITY: blocked unsafe code */";

function scanFile(file: CodeFile): { sanitizedContent: string; warnings: SanitizeWarning[] } {
  const warnings: SanitizeWarning[] = [];
  const lines = file.content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of ALL_PATTERNS) {
      if (!rule.regex.test(line)) continue;

      warnings.push({
        file: file.path,
        line: i + 1,
        pattern: rule.label,
        severity: rule.severity,
      });

      if (rule.severity === "block") {
        lines[i] = BLOCKED_LINE_REPLACEMENT;
        break;
      }
    }
  }

  return { sanitizedContent: lines.join("\n"), warnings };
}

function buildFileBlockPattern(file: CodeFile): RegExp {
  const escapedPath = file.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedContent = file.content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(\\x60\\x60\\x60\\w+\\s+file="${escapedPath}"[^\\n]*)\\n${escapedContent}\\n(\\x60\\x60\\x60)`,
  );
}

export function sanitizeOutput(content: string): SanitizeResult {
  const project = parseCodeProject(content);

  if (project.files.length === 0) {
    return { sanitized: content, warnings: [], blockedFiles: [] };
  }

  const allWarnings: SanitizeWarning[] = [];
  const blockedFiles: string[] = [];
  let result = content;

  for (const file of project.files) {
    const { sanitizedContent, warnings } = scanFile(file);
    allWarnings.push(...warnings);

    const hasBlock = warnings.some((w) => w.severity === "block");
    if (hasBlock && !blockedFiles.includes(file.path)) {
      blockedFiles.push(file.path);
    }

    if (sanitizedContent !== file.content) {
      const pattern = buildFileBlockPattern(file);
      const replaced = result.replace(pattern, `$1\n${sanitizedContent}\n$2`);
      if (replaced !== result) {
        result = replaced;
      } else {
        result = result.replace(file.content, sanitizedContent);
      }
    }
  }

  return { sanitized: result, warnings: allWarnings, blockedFiles };
}
