import type { CodeFile } from "../parser";
import { validateGeneratedCode } from "../retry/validate-syntax";
import { runProjectSanityChecks } from "../validation/project-sanity";

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  score: number;
}

export interface Tier2ReadinessInput {
  sandbox: {
    canStartSandbox: boolean;
    blockingCategories: string[];
  };
  preflightIssues: Array<{
    file: string;
    severity: "error" | "warning";
    message: string;
    category: string;
  }>;
  previewBlockingReason: string | null;
}

const BRACKET_PLACEHOLDER_RE =
  /\[(?:Butiksnamn|Företagsnamn|Produktnamn|Pris|Kundens namn|Company Name|Product Name|Brand Name|Your (?:Company|Brand|Product))\]/gi;

export function checkProjectSanity(files: CodeFile[]): CheckResult {
  const result = runProjectSanityChecks(files);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");

  if (errors.length > 0) {
    return {
      name: "project-sanity",
      passed: false,
      message: errors
        .slice(0, 3)
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join("; "),
      score: 0,
    };
  }

  if (warnings.length > 0) {
    const preview = warnings
      .slice(0, 3)
      .map((issue) => `${issue.file}: ${issue.message}`)
      .join("; ");
    return {
      name: "project-sanity",
      passed: true,
      message: preview,
      score: Math.max(0.6, 1 - warnings.length * 0.1),
    };
  }

  return {
    name: "project-sanity",
    passed: true,
    message: "No cross-file or dependency sanity issues detected",
    score: 1,
  };
}

export function checkNoBracketPlaceholders(files: CodeFile[]): CheckResult {
  let totalHits = 0;
  for (const file of files) {
    const matches = file.content.match(BRACKET_PLACEHOLDER_RE);
    if (matches) totalHits += matches.length;
  }

  if (totalHits === 0) {
    return {
      name: "no-bracket-placeholders",
      passed: true,
      message: "No bracket placeholders found",
      score: 1,
    };
  }

  return {
    name: "no-bracket-placeholders",
    passed: false,
    message: `Found ${totalHits} bracket placeholder(s) that should be replaced with real content`,
    score: Math.max(0, 1 - totalHits * 0.25),
  };
}

export function checkTier2Readiness(preflight: Tier2ReadinessInput): CheckResult {
  const blockingIssues = preflight.preflightIssues.filter((issue) => issue.severity === "error");

  if (preflight.sandbox.canStartSandbox) {
    const warnings = preflight.preflightIssues.filter((issue) => issue.severity === "warning");
    return {
      name: "tier2-readiness",
      passed: true,
      message:
        warnings.length > 0
          ? `${warnings.length} non-blocking preflight warning(s); tier-2 can still start`
          : "Tier-2 preview contract looks runnable",
      score: warnings.length > 0 ? Math.max(0.75, 1 - warnings.length * 0.05) : 1,
    };
  }

  const primaryMessage =
    blockingIssues[0]?.message ??
    preflight.previewBlockingReason ??
    "Tier-2 preview would likely fail preflight checks";
  const categories =
    preflight.sandbox.blockingCategories.length > 0
      ? ` [${preflight.sandbox.blockingCategories.join(", ")}]`
      : "";

  return {
    name: "tier2-readiness",
    passed: false,
    message: `${primaryMessage}${categories}`,
    score: 0,
  };
}

export function checkFileCount(
  files: CodeFile[],
  min: number,
  max: number,
): CheckResult {
  const count = files.length;
  const passed = count >= min && count <= max;

  if (count < min) {
    return {
      name: "file-count",
      passed,
      message: `Expected at least ${min} files, got ${count}`,
      score: count / min,
    };
  }
  if (count > max) {
    return {
      name: "file-count",
      passed,
      message: `Expected at most ${max} files, got ${count}`,
      score: Math.max(0, 1 - (count - max) / max),
    };
  }

  return { name: "file-count", passed: true, message: `${count} files (ok)`, score: 1 };
}

export function checkRequiredFiles(
  files: CodeFile[],
  required: string[],
): CheckResult {
  if (required.length === 0) {
    return { name: "required-files", passed: true, message: "No required files", score: 1 };
  }

  const paths = new Set(files.map((f) => f.path));
  const missing = required.filter((r) => !paths.has(r));
  const found = required.length - missing.length;

  if (missing.length > 0) {
    return {
      name: "required-files",
      passed: false,
      message: `Missing: ${missing.join(", ")}`,
      score: found / required.length,
    };
  }

  return { name: "required-files", passed: true, message: "All required files present", score: 1 };
}

export function checkExports(files: CodeFile[]): CheckResult {
  const routeFiles = files.filter(
    (f) =>
      (f.language === "tsx" || f.language === "jsx") &&
      /(^|\/)(page|layout)\.(tsx|jsx)$/.test(f.path),
  );

  if (routeFiles.length === 0) {
    return { name: "exports", passed: true, message: "No route files to check", score: 1 };
  }

  const DEFAULT_EXPORT_RE = /export\s+default\b/;
  const missing = routeFiles.filter((f) => !DEFAULT_EXPORT_RE.test(f.content));
  const found = routeFiles.length - missing.length;

  if (missing.length > 0) {
    return {
      name: "exports",
      passed: false,
      message: `Missing default export in route file: ${missing.map((f) => f.path).join(", ")}`,
      score: found / routeFiles.length,
    };
  }

  return { name: "exports", passed: true, message: "All route files have default exports", score: 1 };
}

export function checkImports(
  files: CodeFile[],
  required: string[],
): CheckResult {
  if (required.length === 0) {
    return { name: "imports", passed: true, message: "No required imports", score: 1 };
  }

  const allContent = files.map((f) => f.content).join("\n");
  const missing = required.filter((imp) => !allContent.includes(imp));
  const found = required.length - missing.length;

  if (missing.length > 0) {
    return {
      name: "imports",
      passed: false,
      message: `Missing imports: ${missing.join(", ")}`,
      score: found / required.length,
    };
  }

  return { name: "imports", passed: true, message: "All required imports present", score: 1 };
}

export async function checkSyntax(content: string): Promise<CheckResult> {
  try {
    const result = await validateGeneratedCode(content);
    if (result.valid) {
      return { name: "syntax", passed: true, message: "All files pass syntax check", score: 1 };
    }

    const errorCount = result.errors.length;
    return {
      name: "syntax",
      passed: false,
      message: `${errorCount} syntax error${errorCount === 1 ? "" : "s"}: ${result.errors
        .slice(0, 3)
        .map((e) => `${e.file}:${e.line} ${e.message}`)
        .join("; ")}`,
      score: 0,
    };
  } catch (err) {
    return {
      name: "syntax",
      passed: false,
      message: `Syntax check failed: ${err instanceof Error ? err.message : String(err)}`,
      score: 0,
    };
  }
}

const RESPONSIVE_RE = /\b(sm|md|lg|xl|2xl):/;

export function checkResponsive(files: CodeFile[]): CheckResult {
  const componentFiles = files.filter(
    (f) => f.language === "tsx" || f.language === "jsx",
  );

  if (componentFiles.length === 0) {
    return { name: "responsive", passed: true, message: "No component files", score: 1 };
  }

  const withResponsive = componentFiles.filter((f) => RESPONSIVE_RE.test(f.content));
  const ratio = withResponsive.length / componentFiles.length;

  if (withResponsive.length === 0) {
    return {
      name: "responsive",
      passed: false,
      message: "No responsive classes found in any component",
      score: 0,
    };
  }

  const allHave = withResponsive.length === componentFiles.length;
  return {
    name: "responsive",
    passed: allHave,
    message: `${withResponsive.length}/${componentFiles.length} components use responsive classes`,
    score: ratio,
  };
}

const ALT_ATTR_RE = /\balt\s*=/;
const ARIA_RE = /\baria-\w+\s*=/;
const SEMANTIC_HTML_RE = /<(?:header|nav|main|section|article|footer)\b/;

export function checkAccessibility(files: CodeFile[]): CheckResult {
  const componentFiles = files.filter(
    (f) => f.language === "tsx" || f.language === "jsx",
  );

  if (componentFiles.length === 0) {
    return { name: "accessibility", passed: true, message: "No component files", score: 1 };
  }

  const allContent = componentFiles.map((f) => f.content).join("\n");

  let score = 0;
  const issues: string[] = [];

  const hasImages = /<(?:img|Image)\b/.test(allContent);
  if (hasImages) {
    if (ALT_ATTR_RE.test(allContent)) {
      score += 0.35;
    } else {
      issues.push("images missing alt attributes");
    }
  } else {
    score += 0.35;
  }

  if (ARIA_RE.test(allContent)) {
    score += 0.3;
  } else {
    issues.push("no aria-* attributes found");
  }

  if (SEMANTIC_HTML_RE.test(allContent)) {
    score += 0.35;
  } else {
    issues.push("no semantic HTML elements");
  }

  return {
    name: "accessibility",
    passed: score >= 0.65,
    message: issues.length > 0 ? issues.join("; ") : "Good accessibility patterns",
    score,
  };
}

const HARDCODED_BG_RE = /\bbg-(white|black|gray-\d+|slate-\d+|zinc-\d+)\b/;
const SEMANTIC_TOKEN_RE = /\b(bg-background|text-foreground|bg-primary|text-primary|bg-secondary|bg-muted|text-muted)/;

export function checkSemanticTokens(files: CodeFile[]): CheckResult {
  const componentFiles = files.filter(
    (f) => f.language === "tsx" || f.language === "jsx",
  );

  if (componentFiles.length === 0) {
    return { name: "semantic-tokens", passed: true, message: "No component files", score: 1 };
  }

  const allContent = componentFiles.map((f) => f.content).join("\n");
  const hasSemantic = SEMANTIC_TOKEN_RE.test(allContent);
  const hasHardcoded = HARDCODED_BG_RE.test(allContent);

  if (hasSemantic && !hasHardcoded) {
    return { name: "semantic-tokens", passed: true, message: "Uses semantic color tokens", score: 1 };
  }
  if (hasSemantic && hasHardcoded) {
    return {
      name: "semantic-tokens",
      passed: true,
      message: "Uses semantic tokens but also has hardcoded colors",
      score: 0.6,
    };
  }
  if (!hasSemantic && hasHardcoded) {
    return {
      name: "semantic-tokens",
      passed: false,
      message: "Uses hardcoded colors instead of semantic tokens",
      score: 0.2,
    };
  }

  return { name: "semantic-tokens", passed: true, message: "No color classes detected", score: 0.8 };
}
