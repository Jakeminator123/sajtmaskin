import type { CodeFile } from "../parser";
import { validateGeneratedCode } from "../retry/validate-syntax";
import { runProjectSanityChecks } from "../validation/project-sanity";
import type { SeoPreflightIssue } from "../validation/seo-preflight";
import { analyzeVisualQuality } from "../verify/visual-qa";

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  score: number;
}

export interface Tier2ReadinessInput {
  previewStart: {
    canStartPreview: boolean;
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

/**
 * Known scaffold placeholder prefixes. When a file contains text of the
 * form `[<prefix>...]`, the LLM did not replace the scaffold stub with real
 * Swedish/English content. We keep the list explicit (not a generic
 * `[A-Z...]`-regex) to avoid catching legitimate JSX patterns like
 * `items[0]`, dynamic route segments in comments (`[slug]`), or code
 * accessors. Update when a new scaffold introduces a new placeholder kind.
 */
export const BRACKET_PLACEHOLDER_PREFIXES: readonly string[] = [
  // Brand / identity
  "Butiksnamn",
  "Företagsnamn",
  "Produktnamn",
  "Projektnamn",
  "Brand Name",
  "Company Name",
  "Product Name",
  "Your Company",
  "Your Brand",
  "Your Product",
  // Pricing
  "Pris",
  "Priser",
  "Paket",
  "Inkluderat",
  "Från",
  // Content blocks
  "Rubrik",
  "Huvudrubrik",
  "Ingress",
  "Kort slagord",
  "Kort förklaring",
  "Kort ingress",
  "Kort kundlöfte",
  "Kort meta-beskrivning",
  "Kort sammanfattning",
  "Kort text",
  "Kort företagsbeskrivning",
  "Meta-beskrivning",
  "Beskriv",
  "1–2 meningar",
  "1-2 meningar",
  // Structural sections
  "Sektion",
  "Sektionsetikett",
  "Etikett",
  "Sidopanelens rubrik",
  "Kolumn",
  "Länk",
  "Kategori",
  "Erbjudande",
  "Fördel",
  "Nyckeltal",
  "Punkt",
  "Tjänst",
  "Bransch",
  "Ort",
  // CTAs
  "CTA",
  "Primär CTA",
  "Sekundär CTA",
  // Trust / about
  "Social proof",
  "Förtroendesignal",
  "Kundcitat",
  "Kundens namn",
  "Auktoriserad",
  "Auktorisation",
  "Namn på",
  "X år",
  "X specialister",
  "Y+",
  "År",
  "av organ",
  // Process
  "Första kontakt",
  "Behovsanalys",
  "Förslag",
  "Leverans",
  "Hur kunden",
  "Hur ni",
  "Själva leveransen",
  "Tydligt upplägg",
  "Text som uppmanar",
  // Contact
  "Kontakt",
  "Roll",
  "Gatuadress",
  "Postnummer",
];

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sort by length descending so longer, more specific prefixes match first
// (e.g. "Primär CTA" before "CTA"). After the prefix we allow either `]`
// (bare placeholder) or a non-identifier continuation (space, hyphen,
// punctuation) followed by arbitrary text up to `]`. That prevents false
// positives like `[CTAcomputed]` while still matching `[CTA-rubrik]`.
const SORTED_PLACEHOLDER_PREFIXES = [...BRACKET_PLACEHOLDER_PREFIXES].sort(
  (a, b) => b.length - a.length,
);

const BRACKET_PLACEHOLDER_RE = new RegExp(
  `\\[(?:${SORTED_PLACEHOLDER_PREFIXES.map(escapeRegex).join("|")})(?:[-\\s,.:;!?/()"'][^\\]]*)?\\]`,
  "gu",
);

/** Files considered critical for placeholder-blocking preview. */
const CRITICAL_PLACEHOLDER_FILES = [
  /(^|\/)app\/page\.tsx$/,
  /(^|\/)src\/app\/page\.tsx$/,
  /(^|\/)app\/layout\.tsx$/,
  /(^|\/)src\/app\/layout\.tsx$/,
];

function isCriticalPlaceholderFile(filePath: string): boolean {
  return CRITICAL_PLACEHOLDER_FILES.some((re) => re.test(filePath));
}

export interface PlaceholderHitSummary {
  file: string;
  count: number;
  samples: string[];
}

/**
 * Return per-file placeholder hit counts. Used by finalize-preflight to
 * decide whether to block the preview (critical files only) and by the
 * eval runner to score the no-placeholder gate.
 */
export function findBracketPlaceholderHits(files: CodeFile[]): PlaceholderHitSummary[] {
  const summaries: PlaceholderHitSummary[] = [];
  for (const file of files) {
    const matches = file.content.match(BRACKET_PLACEHOLDER_RE);
    if (!matches || matches.length === 0) continue;
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      if (seen.has(match)) continue;
      seen.add(match);
      unique.push(match);
      if (unique.length >= 5) break;
    }
    summaries.push({ file: file.path, count: matches.length, samples: unique });
  }
  return summaries;
}

/**
 * Return placeholder hits that live in critical scaffold files (home page,
 * layout). These are the ones finalize-preflight blocks the preview on.
 */
export function findCriticalPlaceholderHits(files: CodeFile[]): PlaceholderHitSummary[] {
  return findBracketPlaceholderHits(files).filter((entry) =>
    isCriticalPlaceholderFile(entry.file),
  );
}

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
  const hits = findBracketPlaceholderHits(files);
  const totalHits = hits.reduce((sum, entry) => sum + entry.count, 0);

  if (totalHits === 0) {
    return {
      name: "no-bracket-placeholders",
      passed: true,
      message: "No bracket placeholders found",
      score: 1,
    };
  }

  const sample = hits
    .slice(0, 3)
    .map((entry) => `${entry.file} (${entry.count})`)
    .join("; ");

  return {
    name: "no-bracket-placeholders",
    passed: false,
    message: `Found ${totalHits} bracket placeholder(s) that should be replaced with real content: ${sample}`,
    score: Math.max(0, 1 - totalHits * 0.25),
  };
}

export function checkTier2Readiness(preflight: Tier2ReadinessInput): CheckResult {
  const blockingIssues = preflight.preflightIssues.filter((issue) => issue.severity === "error");

  if (preflight.previewStart.canStartPreview) {
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
    preflight.previewStart.blockingCategories.length > 0
      ? ` [${preflight.previewStart.blockingCategories.join(", ")}]`
      : "";

  return {
    name: "tier2-readiness",
    passed: false,
    message: `${primaryMessage}${categories}`,
    score: 0,
  };
}

export function checkSeoPublishReadiness(issues: SeoPreflightIssue[]): CheckResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  if (errors.length > 0) {
    return {
      name: "seo-publish-readiness",
      passed: false,
      message: errors
        .slice(0, 3)
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join("; "),
      score: 0,
    };
  }

  if (warnings.length > 0) {
    return {
      name: "seo-publish-readiness",
      passed: true,
      message: warnings
        .slice(0, 3)
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join("; "),
      score: Math.max(0.6, 1 - warnings.length * 0.1),
    };
  }

  return {
    name: "seo-publish-readiness",
    passed: true,
    message: "SEO/publish baseline looks healthy",
    score: 1,
  };
}

export function checkVisualQuality(files: CodeFile[]): CheckResult {
  const visual = analyzeVisualQuality(
    files.map((file) => ({ path: file.path, content: file.content })),
  );
  const failedChecks = visual.checks.filter((check) => !check.passed);

  if (failedChecks.length === 0) {
    return {
      name: "visual-quality",
      passed: true,
      message: "Visual baseline looks strong",
      score: visual.overallScore / 100,
    };
  }

  return {
    name: "visual-quality",
    passed: visual.passed,
    message: failedChecks
      .slice(0, 3)
      .map((check) => `${check.check}: ${check.detail}`)
      .join("; "),
    score: visual.overallScore / 100,
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
