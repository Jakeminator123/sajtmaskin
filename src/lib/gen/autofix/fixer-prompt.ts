export const FIXER_SYSTEM_PROMPT = `You are a code fixer for Next.js/React/TypeScript projects. You receive broken code in CodeProject format (fenced code blocks with file="path" attributes) along with specific error messages.

Your job:
1. Fix ONLY the errors listed. Do not refactor, improve, or redesign the code.
- Do not edit dossier verbatim files or integration glue (auth/webhook/payment/email handlers) except to fix the listed error with the smallest possible diff. When in doubt about whether a file is verbatim, leave it unchanged.
2. Return the fixed code in the same CodeProject format.
3. Only include files you actually changed. Omit unchanged files.
4. Every file you do include MUST be the complete file content from first line to last line.
5. Never return snippets, patch hunks, partial import sections, or excerpted fragments.
4. Common fixes you should know:
   - Missing "use client" → add it as the first line
   - Missing imports → add the import statement
   - Unclosed JSX tags → close them properly
   - TypeScript type errors → fix types or add type assertions
   - Missing default export → add export default to the main component
   - Syntax errors → fix the specific syntax issue
5. CRITICAL import mistakes to watch for (these cause build failures):
   - Link from "lucide-react" used as <Link href="..."> → must be: import Link from "next/link" (rename icon to LinkIcon)
   - Image from "lucide-react" used as <Image src="..." /> → must be: import Image from "next/image" (rename icon to ImageIcon)
   - Never import routing/navigation components (Link, Image, useRouter) from icon libraries
6. Icon component typing/rendering mistakes to avoid:
   - If an object field stores an icon component, type it as LucideIcon (or ComponentType), not ReactNode.
   - Do not render icon component references directly as raw values (e.g. {item.icon}).
   - Render icon components as JSX (e.g. <item.icon className="h-5 w-5" />).
   - Never use icon component values as React key; use stable text/id fields instead.
7. React Three Fiber / three.js typing pitfalls (TS2322 on <mesh>/<group>/geometry props):
   - Props \`position\`, \`scale\`, \`rotation\`, and 3-element \`args\` accept Vector3-like tuples. When you put a 3-number array in an OBJECT FIELD or VARIABLE (e.g. \`const drops = [{ position: [1,2,3] }]\`), TypeScript widens it to \`number[]\`. Suffix it with \`as const\`: \`{ position: [1,2,3] as const }\`. Inline JSX (\`<mesh position={[1,2,3]}>\`) is fine — only object/variable storage breaks.
   - Use \`import type { Group, Mesh } from "three"\` for ref typings; do not redeclare them.
   - For \`useRef\` on three primitives, prefer \`useRef<Group>(null)\` (not \`useRef<Group | null>\`); RTF accepts the resulting ref shape directly.
8. If uncertain about a fix for a given file, omit that file from your output entirely (do not return a partial fix and do not return a placeholder). The merge step preserves the original. Only as a last resort, if the file MUST be returned and the fix is truly unknowable from the diagnostics, return the file unchanged with a single \`// FIXME: <error id> — context insufficient\` comment near the failing line — never delete or rewrite surrounding code.
9. If you change a file like app/page.tsx or components/foo.tsx, return the full file including imports and exports.

Output: Only fenced code blocks with file="path". No explanations.`;

const STRUCTURED_ERROR_RE = /^([^\s:][^:\s]*\.[^:\s]+):(\d+)(?::(\d+))?\s+(.+)$/;
const DIAGNOSTIC_PREFIX_RE = /^\[([^\]]+)\]\s+(.+)$/;
const MAX_PRIMARY_ERRORS = 40;
const MAX_CONTEXT_LINES = 20;
const MAX_REQUIRED_FILES = 20;
const MAX_RECURRING_PATTERNS = 6;
const MIN_RECURRING_OCCURRENCES = 2;

/**
 * En subset av `RunFixPattern` (i `@/lib/logging/generation-log-writer`)
 * som fixer-prompten faktiskt bryr sig om. Vi håller typen lokal i
 * autofix-paketet så detta paket inte beror på loggning för typing.
 */
export type RecurringFailurePattern = {
  pattern: string;
  occurrences: number;
  files?: Array<{ file: string; count: number }>;
  example?: string | null;
};

type FixerPromptOptions = {
  requiredFiles?: string[];
  recurringPatterns?: RecurringFailurePattern[];
};

type StructuredFixerError = {
  file: string;
  line: string;
  column: string | null;
  message: string;
  prefixed: boolean;
};

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseStructuredError(value: string): StructuredFixerError | null {
  const tagged = value.match(DIAGNOSTIC_PREFIX_RE);
  const candidate = tagged?.[2] ?? value;
  const match = candidate.match(STRUCTURED_ERROR_RE);
  if (!match) return null;
  return {
    file: match[1],
    line: match[2],
    column: match[3] ?? null,
    message: match[4],
    prefixed: Boolean(tagged),
  };
}

export function buildFixerUserPrompt(
  content: string,
  errors: string[],
  options?: FixerPromptOptions,
): string {
  const normalizedErrors = uniqueNonEmpty(errors);
  const structuredErrors: StructuredFixerError[] = [];
  const taggedStructuredSignals: string[] = [];
  const taggedStructuredFiles: string[] = [];
  const contextualSignals: string[] = [];

  for (const error of normalizedErrors) {
    const structured = parseStructuredError(error);
    if (structured) {
      if (structured.prefixed) {
        taggedStructuredSignals.push(error);
        taggedStructuredFiles.push(structured.file);
      } else {
        structuredErrors.push(structured);
      }
      continue;
    }
    contextualSignals.push(error);
  }

  const primaryErrors = structuredErrors.slice(0, MAX_PRIMARY_ERRORS);
  const primaryFiles = primaryErrors.map((error) => error.file);
  const requiredFiles = uniqueNonEmpty([
    ...(options?.requiredFiles ?? []),
    ...primaryFiles,
    ...taggedStructuredFiles,
  ]).slice(0, MAX_REQUIRED_FILES);
  const secondarySignals = (
    primaryErrors.length > 0
      ? [...taggedStructuredSignals, ...contextualSignals]
      : [...contextualSignals]
  ).slice(0, MAX_CONTEXT_LINES);

  const sections: string[] = ["Fix the blocking code issues below.", ""];

  if (primaryErrors.length > 0) {
    sections.push("Primary blocking diagnostics:");
    sections.push(
      ...primaryErrors.map((error, index) => {
        const location = error.column
          ? `${error.file}:${error.line}:${error.column}`
          : `${error.file}:${error.line}`;
        return `${index + 1}. ${location} ${error.message}`;
      }),
    );
    if (structuredErrors.length > primaryErrors.length) {
      sections.push(
        `... ${structuredErrors.length - primaryErrors.length} additional structured diagnostics omitted to keep the repair focused.`,
      );
    }
  } else {
    sections.push("Blocking diagnostics:");
    sections.push(
      ...normalizedErrors.slice(0, MAX_PRIMARY_ERRORS).map((error, index) => `${index + 1}. ${error}`),
    );
  }

  if (secondarySignals.length > 0) {
    sections.push("", "Additional repair context (may explain the root cause):");
    sections.push(...secondarySignals.map((signal) => `- ${signal}`));
    if (contextualSignals.length > secondarySignals.length) {
      sections.push(
        `- ... ${contextualSignals.length - secondarySignals.length} more context lines omitted.`,
      );
    }
  }

  if (requiredFiles.length > 0) {
    sections.push("", "Files that likely need edits first:");
    sections.push(...requiredFiles.map((filePath) => `- ${filePath}`));
  }

  // Recurring failure patterns från tidigare fix-pass i samma chat-session.
  // Filtrera bort enstaka förekomster (vi vill bara visa mönster som faktiskt
  // upprepats) och topplista de N mest frekventa för att hålla prompten kort.
  const recurringPatterns = (options?.recurringPatterns ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.pattern === "string" &&
        typeof p.occurrences === "number" &&
        p.occurrences >= MIN_RECURRING_OCCURRENCES,
    )
    .slice(0, MAX_RECURRING_PATTERNS);
  if (recurringPatterns.length > 0) {
    sections.push(
      "",
      "Recurring failures across previous fix attempts on this site (DO NOT repeat the same fix that already failed — try a different approach):",
    );
    for (const pattern of recurringPatterns) {
      const fileHints =
        Array.isArray(pattern.files) && pattern.files.length > 0
          ? ` in ${pattern.files
              .slice(0, 3)
              .map((f) => f.file)
              .join(", ")}`
          : "";
      const example =
        typeof pattern.example === "string" && pattern.example
          ? ` (example: ${pattern.example.replace(/\s+/g, " ").slice(0, 140)})`
          : "";
      sections.push(
        `- ${pattern.occurrences}× "${pattern.pattern}"${fileHints}${example}`,
      );
    }
  }

  sections.push("", "IMPORTANT:");
  sections.push("- Return only changed files.");
  sections.push("- Every returned file block must contain the complete file from first line to last line.");
  sections.push("- Never return snippets, partial imports, or diff-style patches.");
  sections.push("- Prioritize the listed files and resolve the primary blocking diagnostics before touching anything else.");
  if (recurringPatterns.length > 0) {
    sections.push("- For any recurring failure listed above, change the approach (different import path, different component, different type) instead of re-applying the same fix.");
  }
  sections.push("", "---", "", "Code:", "", content);

  return sections.join("\n");
}
