/**
 * CSS Validator for Tailwind v4 compatibility
 * ============================================
 *
 * Validates CSS custom properties to prevent runtime errors in Tailwind v4.
 * The error "Invalid custom property, expected a value" occurs when:
 * - A custom property is defined without a value: `--color: ;`
 * - A var() reference is malformed: `var(--foo` (missing closing paren)
 * - A custom property value is empty in Tailwind config
 *
 * USAGE:
 *
 * ```typescript
 * import { validateCss, fixCssIssues } from '@/lib/utils/css-validator';
 *
 * const issues = validateCss(cssContent);
 * if (issues.length > 0) {
 *   const fixed = fixCssIssues(cssContent, issues);
 * }
 * ```
 */

export interface CssIssue {
  type:
    | "empty-value"
    | "unclosed-var"
    | "invalid-syntax"
    | "missing-semicolon"
    | "invalid-property-rule";
  line: number;
  column: number;
  property?: string;
  original: string;
  suggestion?: string;
  severity: "error" | "warning";
  endLine?: number;
  action?: "remove-block";
}

function findAtRuleBlockEnd(lines: string[], startIndex: number): number {
  let depth = 0;
  let openFound = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === "{") {
        depth += 1;
        openFound = true;
      } else if (char === "}") {
        if (openFound) depth -= 1;
      }
    }
    if (openFound && depth <= 0) {
      return i;
    }
  }

  return startIndex;
}

/**
 * Validate CSS content for common issues that cause Tailwind v4 errors
 */
export function validateCss(content: string): CssIssue[] {
  const issues: CssIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Detect invalid @property rules (property name must start with --)
    const propertyRuleMatch = line.match(/@property\s+([^\s{]+)/);
    if (propertyRuleMatch) {
      const propertyName = propertyRuleMatch[1]?.trim() || "";
      if (!propertyName.startsWith("--")) {
        const endLine = findAtRuleBlockEnd(lines, i) + 1;
        issues.push({
          type: "invalid-property-rule",
          line: lineNumber,
          column: line.indexOf("@property"),
          property: propertyName,
          original: line.trim(),
          suggestion: "Remove invalid @property rule",
          severity: "warning",
          endLine,
          action: "remove-block",
        });
      }
    }

    // Check for empty custom property values: `--foo: ;` or `--foo:;`
    const emptyValueMatch = line.match(/(--[\w-]+)\s*:\s*;/);
    if (emptyValueMatch) {
      issues.push({
        type: "empty-value",
        line: lineNumber,
        column: line.indexOf(emptyValueMatch[0]),
        property: emptyValueMatch[1],
        original: emptyValueMatch[0],
        suggestion: `${emptyValueMatch[1]}: inherit;`,
        severity: "error",
      });
    }

    // Check for custom property without any value before semicolon or end
    const noValueMatch = line.match(/(--[\w-]+)\s*:\s*$/);
    if (noValueMatch && !line.includes("{")) {
      issues.push({
        type: "empty-value",
        line: lineNumber,
        column: line.indexOf(noValueMatch[0]),
        property: noValueMatch[1],
        original: noValueMatch[0],
        suggestion: `${noValueMatch[1]}: inherit;`,
        severity: "error",
      });
    }

    // Check for unclosed var() - count open and close parens
    const varMatches = line.matchAll(/var\([^)]*$/g);
    for (const match of varMatches) {
      if (match.index !== undefined) {
        issues.push({
          type: "unclosed-var",
          line: lineNumber,
          column: match.index,
          original: match[0],
          suggestion: match[0] + ")",
          severity: "error",
        });
      }
    }

    // Check for malformed var() with definition syntax: `var(--foo: value)`
    const badVarMatch = line.match(/var\((--[\w-]+)\s*:\s*[^)]+\)/);
    if (badVarMatch) {
      issues.push({
        type: "invalid-syntax",
        line: lineNumber,
        column: line.indexOf(badVarMatch[0]),
        property: badVarMatch[1],
        original: badVarMatch[0],
        suggestion: `var(${badVarMatch[1]})`,
        severity: "error",
      });
    }

    // Check for property without semicolon (if next line starts with a property or closing brace)
    if (i < lines.length - 1) {
      const nextLine = lines[i + 1].trim();
      const currentTrimmed = line.trim();
      if (
        currentTrimmed.includes(":") &&
        !currentTrimmed.endsWith(";") &&
        !currentTrimmed.endsWith("{") &&
        !currentTrimmed.endsWith(",") &&
        !currentTrimmed.startsWith("//") &&
        !currentTrimmed.startsWith("/*") &&
        (nextLine.includes(":") || nextLine.startsWith("}"))
      ) {
        issues.push({
          type: "missing-semicolon",
          line: lineNumber,
          column: line.length,
          original: line,
          suggestion: line.trimEnd() + ";",
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

/**
 * Auto-fix CSS issues by applying suggestions
 */
export function fixCssIssues(content: string, issues: CssIssue[]): string {
  if (issues.length === 0) return content;

  const lines = content.split("\n");

  // Sort issues by line number (descending) to fix from bottom to top
  // This prevents line number shifts from affecting subsequent fixes
  const sortedIssues = [...issues].sort((a, b) => b.line - a.line);
  const blockRemoveIssues = sortedIssues.filter(
    (issue) => issue.action === "remove-block" && typeof issue.endLine === "number",
  );
  const inlineIssues = sortedIssues.filter((issue) => issue.action !== "remove-block");

  for (const issue of inlineIssues) {
    if (!issue.suggestion) continue;

    const lineIndex = issue.line - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];

      switch (issue.type) {
        case "empty-value":
          // Replace empty value with inherit
          lines[lineIndex] = line.replace(issue.original, issue.suggestion);
          break;

        case "unclosed-var":
          // Add closing parenthesis
          lines[lineIndex] = line.replace(issue.original, issue.suggestion);
          break;

        case "invalid-syntax":
          // Fix var() with definition syntax
          lines[lineIndex] = line.replace(issue.original, issue.suggestion);
          break;

        case "missing-semicolon":
          // Add semicolon
          lines[lineIndex] = line.trimEnd() + ";";
          break;
        case "invalid-property-rule":
          // Handled via remove-block pass
          break;
      }
    }
  }

  for (const issue of blockRemoveIssues) {
    const lineIndex = issue.line - 1;
    const endIndex = Math.max(lineIndex, (issue.endLine ?? issue.line) - 1);
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines.splice(lineIndex, endIndex - lineIndex + 1);
    }
  }

  return lines.join("\n");
}

/**
 * Validate files array and return issues by file
 */
export interface FileValidationResult {
  fileName: string;
  issues: CssIssue[];
  fixed?: string;
}

export function validateFiles(
  files: Array<{ name: string; content: string }>,
): FileValidationResult[] {
  const results: FileValidationResult[] = [];

  for (const file of files) {
    // Only validate CSS-like files
    if (
      file.name.endsWith(".css") ||
      file.name.endsWith(".scss") ||
      file.name.endsWith(".sass") ||
      file.name.includes("globals") ||
      file.name.includes("tailwind")
    ) {
      const issues = validateCss(file.content);
      if (issues.length > 0) {
        results.push({
          fileName: file.name,
          issues,
          fixed: fixCssIssues(file.content, issues),
        });
      }
    }

    // Also check TSX/JSX files for inline styles with CSS variables
    if (file.name.endsWith(".tsx") || file.name.endsWith(".jsx")) {
      const inlineStyleIssues = validateInlineStyles(file.content);
      if (inlineStyleIssues.length > 0) {
        results.push({
          fileName: file.name,
          issues: inlineStyleIssues,
        });
      }
    }
  }

  return results;
}

/**
 * Validate inline style objects in TSX/JSX for CSS variable issues
 */
function validateInlineStyles(content: string): CssIssue[] {
  const issues: CssIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Look for style objects with CSS variables
    // Pattern: "--something": "" or '--something': ''
    const emptyVarMatch = line.match(/(['"])(--[\w-]+)\1\s*:\s*(['"])\3/);
    if (emptyVarMatch) {
      issues.push({
        type: "empty-value",
        line: lineNumber,
        column: line.indexOf(emptyVarMatch[0]),
        property: emptyVarMatch[2],
        original: emptyVarMatch[0],
        severity: "warning",
      });
    }
  }

  return issues;
}

/**
 * Format issues for display to user
 */
export function formatIssuesForDisplay(results: FileValidationResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = ["CSS Validation Issues Found:", ""];

  for (const result of results) {
    lines.push(`File: ${result.fileName}`);
    for (const issue of result.issues) {
      const severity = issue.severity === "error" ? "❌" : "⚠️";
      lines.push(
        `  ${severity} Line ${issue.line}: ${issue.type}${issue.property ? ` (${issue.property})` : ""}`,
      );
      if (issue.suggestion) {
        lines.push(`     Suggestion: ${issue.suggestion.substring(0, 60)}...`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
