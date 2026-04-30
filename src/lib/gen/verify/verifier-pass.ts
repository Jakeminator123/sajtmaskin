/**
 * Read-only LLM review after syntax validation (telemetry / quality signal).
 * Model comes from phaseRouting.verifier for the active tier (manifest).
 */
import { z } from "zod";
import { generateObject } from "ai";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { toAnthropicEffort } from "@/lib/gen/engine";
import { getOpenAIModel, isAnthropicModel } from "@/lib/gen/models";
import { resolvePostGenerationVerifierConfig } from "@/lib/gen/verify/post-generation-config";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { incVerifierBlocking, recordPhaseDuration } from "@/lib/observability/metrics";

/** OpenAI structured-output strict mode requires no optional object keys — keep paths inside `detail`. */
const VerifierFindingsSchema = z.object({
  blocking: z.array(
    z.object({
      id: z.string(),
      detail: z.string(),
    }),
  ),
  quality: z.array(
    z.object({
      id: z.string(),
      detail: z.string(),
    }),
  ),
});

export type VerifierFindings = z.infer<typeof VerifierFindingsSchema>;

const EMPTY_VERIFIER_FINDINGS: VerifierFindings = {
  blocking: [],
  quality: [],
};

/**
 * Finding ids that we always want surfaced as `blocking` even if the model
 * placed them in `quality`. Keeps the contract stable when prompt drifts.
 */
const FORCE_BLOCKING_IDS = new Set<string>([
  "navigation-placeholder-actions",
  "footer-dead-links",
]);

/**
 * Format verifier blocking findings as fixer-style "errors" for `runLlmFixer`.
 *
 * The verifier returns free-form `detail` strings (often containing the file
 * path inline). The fixer prompt expects errors that look like compiler
 * output — `<file>:<line>:<col> <message>`. We can't always extract a real
 * line/column from verifier output, so we synthesise `1:1` and prefix the
 * detail with a marker so the fixer treats it as a quality blocker rather
 * than a syntax error. The `id` is appended so downstream tooling can
 * still map back to the verifier finding catalogue.
 *
 * SAJ-61 c5: when the finding is `build-breaking-missing-imports` the
 * detail is a Markdown bullet list of `- <file>: uses X but does not
 * import Y`. Split each bullet into its own fixer error line so the LLM
 * sees one structured row per offending file instead of a wall of text.
 */
export function formatVerifierFindingsAsFixerErrors(
  findings: Pick<VerifierFindings, "blocking">,
): string[] {
  const lines: string[] = [];
  for (const f of findings.blocking) {
    const detail = f.detail.trim();
    if (!detail) continue;

    if (f.id === "build-breaking-missing-imports") {
      const bullets = detail
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.replace(/^-\s+/, ""));
      if (bullets.length > 0) {
        for (const bullet of bullets) {
          const filePathMatch = bullet.match(/^([A-Za-z0-9_./@-]+\.\w{1,5})\s*[:\u2014\-]/);
          const prefix = filePathMatch
            ? `${filePathMatch[1]}:1:1 `
            : "verifier:1:1 ";
          lines.push(`${prefix}[verifier:${f.id}] ${bullet}`);
        }
        continue;
      }
    }

    const looksLikePath = /^[A-Za-z0-9_./@-]+\.\w{1,5}:/.test(detail);
    const prefix = looksLikePath ? "" : "verifier:1:1 ";
    lines.push(`${prefix}[verifier:${f.id}] ${detail}`);
  }
  return lines;
}

/**
 * Extract the unique set of file paths referenced inside verifier blocking
 * findings. Used to seed `runLlmRepairGate({ requiredFiles })` so the LLM
 * fixer knows which files must come back complete in its output. Stays
 * conservative: relies on `<path>.<ext>` matching, never fabricates paths.
 */
export function extractFilePathsFromVerifierFindings(
  findings: Pick<VerifierFindings, "blocking">,
): string[] {
  const files = new Set<string>();
  // SAJ-61 review fix: a single shared `/g` RegExp leaks `lastIndex` across
  // iterations of `findings.blocking`, which can cause `re.exec(detail)` on
  // the second finding to start scanning from somewhere in the middle of
  // its string — silently dropping any path that appears before that
  // offset. Reset `lastIndex` per finding (or instantiate per-iteration);
  // we choose reset because the regex is small and reuse is cheap.
  const re = /(^|[^@A-Za-z0-9_./-])([@A-Za-z0-9_./-]+\.[A-Za-z]{1,5})\b/g;
  for (const f of findings.blocking) {
    const detail = f.detail ?? "";
    if (!detail) continue;
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(detail)) !== null) {
      const candidate = match[2];
      if (!candidate) continue;
      // Skip dotfiles and version-like tokens (e.g. "1.2.3"). We only
      // care about emitted source file references.
      if (/^\d/.test(candidate)) continue;
      if (!/\.(?:tsx?|jsx?|css|scss|json|mjs|cjs)$/i.test(candidate)) continue;
      files.add(candidate);
    }
  }
  return [...files];
}

/**
 * Promote known production-quality issues from `quality` to `blocking` so they
 * cannot silently slip through when the LLM mis-classifies them.
 */
function promoteForcedBlockingFindings(findings: VerifierFindings): VerifierFindings {
  if (findings.quality.length === 0) return findings;
  const promoted: typeof findings.blocking = [];
  const remainingQuality: typeof findings.quality = [];
  for (const item of findings.quality) {
    if (FORCE_BLOCKING_IDS.has(item.id)) {
      promoted.push(item);
    } else {
      remainingQuality.push(item);
    }
  }
  if (promoted.length === 0) return findings;
  return {
    blocking: [...findings.blocking, ...promoted],
    quality: remainingQuality,
  };
}

const DETAIL_FILE_PATH_RE = /(^|[^@A-Za-z0-9_./-])([@A-Za-z0-9_./-]+\.(?:tsx?|jsx?))\b/g;
const DETAIL_HASH_HREF_RE = /\bhref\s*(?:=\s*\{?\s*)?(["'`])(#[-A-Za-z0-9_:]+)\1/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileContainsId(content: string, id: string): boolean {
  const escaped = escapeRegExp(id);
  const idAttr = new RegExp(
    String.raw`\bid\s*=\s*(?:"${escaped}"|'${escaped}'|\{\s*(?:"${escaped}"|'${escaped}'|` +
      "`" +
      escaped +
      "`" +
      String.raw`)\s*\})`,
  );
  return idAttr.test(content);
}

function extractDetailFilePaths(detail: string): string[] {
  DETAIL_FILE_PATH_RE.lastIndex = 0;
  const files = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = DETAIL_FILE_PATH_RE.exec(detail)) !== null) {
    if (match[2]) files.add(match[2].replace(/\\/g, "/"));
  }
  return [...files];
}

function extractDetailHashHrefs(detail: string): string[] {
  DETAIL_HASH_HREF_RE.lastIndex = 0;
  const hashes = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = DETAIL_HASH_HREF_RE.exec(detail)) !== null) {
    if (match[2]) hashes.add(match[2]);
  }
  return [...hashes];
}

function isValidInPageHashNavigationFinding(
  detail: string,
  files: Array<Pick<CodeFile, "path" | "content">>,
): boolean {
  const hashHrefs = extractDetailHashHrefs(detail);
  if (hashHrefs.length === 0) return false;

  const mentionedFiles = extractDetailFilePaths(detail);
  if (mentionedFiles.length === 0) return false;

  const fileMap = new Map(files.map((file) => [file.path.replace(/\\/g, "/"), file.content ?? ""]));
  return hashHrefs.every((hash) => {
    const id = hash.slice(1);
    return mentionedFiles.some((path) => fileContainsId(fileMap.get(path) ?? "", id));
  });
}

const PLACEHOLDER_HREF_RE =
  /<(a|Link|Button)\b[^>]*\bhref\s*=\s*(?:""|''|"#"|'#'|\{\s*(?:""|"#"|''|'#')\s*\})/g;

export function checkNavigationPlaceholderActions(
  files: Array<Pick<CodeFile, "path" | "content">>,
  options: { maxFindings?: number } = {},
): VerifierFindings["blocking"] {
  const maxFindings = options.maxFindings ?? 8;
  const findings: VerifierFindings["blocking"] = [];
  for (const file of files) {
    if (findings.length >= maxFindings) break;
    if (!file.path || !file.content) continue;
    if (!/\.(t|j)sx$/i.test(file.path)) continue;
    PLACEHOLDER_HREF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER_HREF_RE.exec(file.content)) !== null) {
      const rawHrefMatch = match[0].match(/href\s*=\s*(.*?)(?:\s|>|$)/);
      const rawHref = rawHrefMatch?.[1]?.replace(/[{}'"]/g, "").trim() ?? "#";
      if (rawHref.startsWith("#") && rawHref.length > 1) {
        const id = rawHref.slice(1);
        if (fileContainsId(file.content, id)) continue;
      }
      findings.push({
        id: "navigation-placeholder-actions",
        detail: `${file.path}: <${match[1]}> uses placeholder href ${rawHref || "(empty)"}. Provide a real route, in-page target with matching id, submit/action handler, or mark it demo-only.`,
      });
      if (findings.length >= maxFindings) break;
    }
  }
  return findings;
}

export function suppressValidInPageAnchorNavigationFindings(
  findings: VerifierFindings,
  files: Array<Pick<CodeFile, "path" | "content">>,
): VerifierFindings {
  const shouldKeep = (finding: { id: string; detail: string }) =>
    finding.id !== "navigation-placeholder-actions" ||
    !isValidInPageHashNavigationFinding(finding.detail, files);

  return {
    blocking: findings.blocking.filter(shouldKeep),
    quality: findings.quality.filter(shouldKeep),
  };
}

type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };
type ProviderOptionsRecord = Record<string, JsonObject>;

export function isVerifierPassEnabled(): boolean {
  const v = process.env.SAJTMASKIN_VERIFIER_PASS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function buildVerifierPromptSnippetFromFiles(files: CodeFile[], charsPerFile: number): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.path || f.content == null) continue;
    const c =
      f.content.length > charsPerFile
        ? `${f.content.slice(0, charsPerFile)}\n…[truncated]`
        : f.content;
    parts.push(`--- FILE: ${f.path} ---\n${c}`);
  }
  return parts.join("\n\n");
}

// Built at runtime so this module's source does not literally contain the
// substring `motion-reduce:hidden`. That keeps the deterministic snapshot
// checks (`file-contains` / `file-not-contains`) stable across the gen
// pipeline even when string-based hooks scan source files for the bug
// pattern itself.
const MOTION_REDUCE_HIDDEN = `motion-reduce` + `:hidden`;
const CANVAS_WITH_CLASSNAME_RE =
  /<Canvas\b[^>]*className\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|\{[^}]*\})/g;
const R3F_IMPORT_RE = /from\s+["']@react-three\/fiber["']|import\s*\(\s*["']@react-three\/fiber["']\s*\)/;
const JSX_CANVAS_RE = /<Canvas\b/;
const USE_CLIENT_RE = /^\s*["']use client["']\s*;?/m;
const ELEMENT_WITH_CLASSNAME_RE =
  /<[A-Za-z][A-Za-z0-9]*\b[^>]*className\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/g;

/**
 * Strip JS/TS line and block comments plus string literals so downstream
 * regex scans don't trip on capitalised words that appear inside text,
 * error messages or type comments. Conservative: keeps whitespace and
 * newlines so line-based regex still works on the scrubbed source.
 */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];
    // Line comment
    if (ch === "/" && next === "/") {
      const eol = source.indexOf("\n", i + 2);
      const end = eol === -1 ? len : eol;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? len : close + 2;
      // Preserve newlines so error line numbers still roughly line up.
      for (let j = i; j < end; j++) out += source[j] === "\n" ? "\n" : " ";
      i = end;
      continue;
    }
    // Double/single quoted string
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += quote;
      i++;
      while (i < len) {
        const c = source[i];
        if (c === "\\" && i + 1 < len) {
          out += "  ";
          i += 2;
          continue;
        }
        if (c === quote) {
          out += quote;
          i++;
          break;
        }
        out += c === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // Template literal (no nested expression tracking — we just blank the
    // contents; good enough to avoid false positives from code samples
    // quoted in template strings).
    if (ch === "`") {
      out += "`";
      i++;
      while (i < len) {
        const c = source[i];
        if (c === "\\" && i + 1 < len) {
          out += "  ";
          i += 2;
          continue;
        }
        if (c === "`") {
          out += "`";
          i++;
          break;
        }
        out += c === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Deterministic check for undefined capitalised JSX component references.
 *
 * Catches the "model invented a component name" failure mode — e.g.
 * `<Cuboid />` (drei/rapier confusion), `<Lucide />`, `<Box3d />` etc. —
 * where the generated `.tsx` uses a symbol that is neither imported nor
 * locally declared. TypeScript + ESLint will also catch it, but those
 * run on the preview-host verify lane AFTER streaming; this runs in-app
 * so the repair-loop can surface a precise, file+symbol-scoped finding
 * to the fixer BEFORE the next verify round.
 *
 * Conservative by design: we skip files with dynamic patterns the simple
 * scanner cannot interpret (re-exports, `React.lazy`, `createElement`)
 * so false positives stay at zero. The cost of missing a real undefined
 * symbol is bounded — tsc/eslint still catches it on the verify lane.
 */
export function checkUndefinedJsxSymbols(
  files: Array<Pick<CodeFile, "path" | "content">>,
  options: { maxFindings?: number } = {},
): VerifierFindings["blocking"] {
  const maxFindings = options.maxFindings ?? 12;
  const findings: VerifierFindings["blocking"] = [];

  for (const f of files) {
    if (findings.length >= maxFindings) break;
    if (!f.path || !f.content) continue;
    if (!/\.(t|j)sx$/i.test(f.path)) continue;

    // Bail on patterns that introduce components dynamically — we'd rather
    // miss than false-positive. SAJ-33 (2026-04-22 audit): tidigare skippades
    // hela filen så fort den innehöll bokstäverna `lazy(` (t.ex. en egen
    // util `lazyRetry(...)` eller `db.users.lazy(...)`), vilket dolde
    // verkliga undefined-JSX-symboler. Begränsa bailouten till `lazy(` som
    // rimligen är React.lazy — antingen namespace-anropat eller importerat
    // från "react" / "react-dom".
    if (/\bcreateElement\s*\(/.test(f.content)) continue;
    if (/\bReact\.lazy\s*\(/.test(f.content)) continue;
    const lazyImportedFromReact =
      /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*['"]react['"]/.test(f.content) ||
      /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*['"]react-dom['"]/.test(f.content);
    if (lazyImportedFromReact && /\blazy\s*\(/.test(f.content)) continue;

    const scrubbed = stripCommentsAndStrings(f.content);
    const declared = collectDeclaredIdentifiers(scrubbed);
    const seen = new Set<string>();

    const JSX_OPENING_TAG = /<([A-Z][A-Za-z0-9_$]*)(?:\.[A-Za-z0-9_$]+)*[\s/>]/g;
    let match: RegExpExecArray | null;
    while ((match = JSX_OPENING_TAG.exec(scrubbed)) !== null) {
      const name = match[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (declared.has(name)) continue;
      if (ALWAYS_IN_SCOPE.has(name)) continue;
      findings.push({
        id: "undefined-jsx-symbol",
        detail: `${f.path}: \`<${name} />\` is used but \`${name}\` is neither imported nor declared in this file. Either import it from the correct package or replace it with a supported element. (If the model meant a React Three Fiber primitive, use lowercase \`<mesh>\` + \`<boxGeometry>\`, or import \`Box\` from \`@react-three/drei\`.)`,
      });
      if (findings.length >= maxFindings) break;
    }
  }

  return findings;
}

/**
 * Identifiers that are always considered in-scope for JSX even when not
 * explicitly imported in the file. `React` is the classic case (old JSX
 * transform, or namespaced access like `<React.Suspense>`). `Fragment`
 * is included because some toolchains auto-inject it.
 */
const ALWAYS_IN_SCOPE = new Set<string>(["React", "Fragment"]);

function collectDeclaredIdentifiers(scrubbedSource: string): Set<string> {
  const declared = new Set<string>();

  // Named imports: `import { A, B as C, D } from "..."` (supports multi-line).
  const NAMED_IMPORT_RE = /import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([\s\S]*?)\}\s*from\s+['"][^'"]+['"]/g;
  let m: RegExpExecArray | null;
  while ((m = NAMED_IMPORT_RE.exec(scrubbedSource)) !== null) {
    const body = m[1];
    if (!body) continue;
    for (const part of body.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const alias = trimmed.split(/\s+as\s+/).pop();
      const id = alias?.trim().replace(/^type\s+/, "");
      if (id && /^[A-Za-z_$][\w$]*$/.test(id)) declared.add(id);
    }
  }

  // Default / namespace / side-effect-only imports.
  const DEFAULT_IMPORT_RE = /import\s+([A-Za-z_$][\w$]*)(?:\s*,\s*(?:\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*))?\s+from\s+['"][^'"]+['"]/g;
  while ((m = DEFAULT_IMPORT_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }
  const NAMESPACE_IMPORT_RE = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+['"]/g;
  while ((m = NAMESPACE_IMPORT_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }

  // Top-level-ish declarations: function, class, const/let/var NAME.
  const FN_DECL_RE = /\b(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g;
  while ((m = FN_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }
  const CLASS_DECL_RE = /\b(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/g;
  while ((m = CLASS_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }
  const VAR_DECL_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/g;
  while ((m = VAR_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }

  // Object-destructured consts: `const { A, B: C } = obj;`
  const OBJECT_DESTRUCT_RE = /\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
  while ((m = OBJECT_DESTRUCT_RE.exec(scrubbedSource)) !== null) {
    const body = m[1];
    if (!body) continue;
    for (const part of body.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const alias = trimmed.split(/\s*:\s*/).pop();
      const id = alias?.trim();
      if (id && /^[A-Za-z_$][\w$]*$/.test(id)) declared.add(id);
    }
  }

  // Array-destructured consts: `const [A, B = Default, ...rest] = tuple;`
  // Handles the `const [Component, setComponent] = useState(Initial)` pattern
  // plus holes (`const [, Second]`), defaults, and rest elements. Nested
  // destructuring (`const [{ x }, [y]] = …`) is skipped — conservative.
  const ARRAY_DESTRUCT_RE = /\b(?:const|let|var)\s*\[([^\]]+)\]\s*=/g;
  while ((m = ARRAY_DESTRUCT_RE.exec(scrubbedSource)) !== null) {
    const body = m[1];
    if (!body) continue;
    for (const part of body.split(",")) {
      let trimmed = part.trim();
      if (!trimmed) continue; // hole, e.g. `const [, second] = …`
      if (trimmed.startsWith("...")) trimmed = trimmed.slice(3).trim();
      const eq = trimmed.indexOf("=");
      if (eq !== -1) trimmed = trimmed.slice(0, eq).trim();
      // Skip nested object/array patterns — conservative.
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) continue;
      if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) declared.add(trimmed);
    }
  }

  // Type-only symbols also count — someone could JSX-reference a type
  // in error; we want to still treat it as "defined" to avoid noise.
  const TYPE_DECL_RE = /\btype\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = TYPE_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }
  const INTERFACE_DECL_RE = /\binterface\s+([A-Za-z_$][\w$]*)/g;
  while ((m = INTERFACE_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }
  const ENUM_DECL_RE = /\benum\s+([A-Za-z_$][\w$]*)/g;
  while ((m = ENUM_DECL_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) declared.add(m[1]);
  }

  // SAJ-33 (2026-04-22 audit): TS generic type parameters (`function f<T>`,
  // `class Foo<T, U>`, `interface Bar<T extends X>`, `type Baz<T> = …`, and
  // arrow generics `<T,>(x) => …`) look like JSX opening tags to the coarse
  // `JSX_OPENING_TAG` regex. Register the declared type-parameter names here
  // so legitimate .tsx code with generics does not get flagged with
  // `undefined-jsx-symbol: T` and block the quality gate.
  const addGenericParams = (paramList: string) => {
    for (const part of paramList.split(",")) {
      const head = part
        .trim()
        .replace(/^readonly\s+/, "")
        .match(/^([A-Za-z_$][\w$]*)/);
      if (head && head[1]) declared.add(head[1]);
    }
  };
  const FN_GENERIC_RE = /\bfunction\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*<([^<>]+)>/g;
  while ((m = FN_GENERIC_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) addGenericParams(m[1]);
  }
  const CLASS_IFACE_GENERIC_RE = /\b(?:class|interface)\s+[A-Za-z_$][\w$]*\s*<([^<>]+)>/g;
  while ((m = CLASS_IFACE_GENERIC_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) addGenericParams(m[1]);
  }
  const TYPE_GENERIC_RE = /\btype\s+[A-Za-z_$][\w$]*\s*<([^<>]+)>\s*=/g;
  while ((m = TYPE_GENERIC_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) addGenericParams(m[1]);
  }
  // Arrow-generic context: `<T,>(` or `<T extends X>(` — trailing `(` is
  // required so ordinary JSX `<Foo>` never matches. Also covers the common
  // `const useThing = <T,>(…) => …` and method-generic shapes.
  const ARROW_GENERIC_RE =
    /<\s*([A-Z][\w$]*(?:\s+extends\s+[^,<>]+)?(?:\s*=\s*[^,<>]+)?(?:\s*,\s*(?:[A-Z][\w$]*)(?:\s+extends\s+[^,<>]+)?(?:\s*=\s*[^,<>]+)?)*\s*,?\s*)>\s*\(/g;
  while ((m = ARROW_GENERIC_RE.exec(scrubbedSource)) !== null) {
    if (m[1]) addGenericParams(m[1]);
  }

  return declared;
}

/**
 * Deterministic check for the "motion-reduce trap": when a `<Canvas>` (or a
 * fixed full-screen overlay wrapping one) hides itself entirely under
 * `prefers-reduced-motion` instead of swapping to a static fallback. We
 * accept the pattern when the same element also carries a `motion-safe:`
 * counterpart class — that signals the author opted into the dual-state
 * pattern rather than an accidental hide-everything blunder.
 */
export function checkMotionReduceTrap(
  files: Array<Pick<CodeFile, "path" | "content">>,
): VerifierFindings["blocking"] {
  const findings: VerifierFindings["blocking"] = [];
  for (const f of files) {
    if (!f.path || !f.content) continue;
    if (!/\.(t|j)sx$/i.test(f.path)) continue;
    if (!f.content.includes(MOTION_REDUCE_HIDDEN)) continue;

    for (const match of f.content.match(CANVAS_WITH_CLASSNAME_RE) ?? []) {
      if (match.includes(MOTION_REDUCE_HIDDEN) && !match.includes("motion-safe:")) {
        findings.push({
          id: "motion-reduce-canvas-trap",
          detail: `${f.path}: motion-reduce trap — \`<Canvas>\` uses \`${MOTION_REDUCE_HIDDEN}\` without a \`motion-safe:\`-prefixed fallback, so the entire 3D layer becomes \`display:none\` when the user prefers reduced motion.`,
        });
      }
    }

    for (const match of f.content.match(ELEMENT_WITH_CLASSNAME_RE) ?? []) {
      if (
        match.includes("fixed inset-0") &&
        match.includes("pointer-events-none") &&
        match.includes(MOTION_REDUCE_HIDDEN) &&
        !match.includes("motion-safe:")
      ) {
        findings.push({
          id: "motion-reduce-overlay-trap",
          detail: `${f.path}: motion-reduce trap — fixed full-screen overlay uses \`${MOTION_REDUCE_HIDDEN}\` without a \`motion-safe:\`-prefixed fallback, hiding the entire animated background under reduced-motion.`,
        });
      }
    }
  }
  return findings;
}

/**
 * R3F `<Canvas>` is a browser-only runtime boundary. In Next App Router, any
 * file that imports/renders it must be a client component; typecheck can pass
 * while runtime preview fails with server-component/client-hook errors.
 */
export function checkR3FClientBoundary(
  files: Array<Pick<CodeFile, "path" | "content">>,
): VerifierFindings["blocking"] {
  const findings: VerifierFindings["blocking"] = [];
  for (const f of files) {
    if (!f.path || !f.content) continue;
    if (!/\.(t|j)sx$/i.test(f.path)) continue;
    const hasR3FCanvas = R3F_IMPORT_RE.test(f.content) || JSX_CANVAS_RE.test(f.content);
    if (!hasR3FCanvas || USE_CLIENT_RE.test(f.content)) continue;
    findings.push({
      id: "r3f-client-boundary",
      detail: `${f.path}: React Three Fiber \`<Canvas>\` appears in a file without \`"use client"\`; this can pass typecheck but fail at runtime in Next App Router.`,
    });
  }
  return findings;
}

export async function runVerifierPass(
  codeProjectContent: string,
  opts: { resolvedTier: CanonicalModelId; abortSignal?: AbortSignal },
): Promise<VerifierFindings> {
  const verifierStartedAt = Date.now();
  const recordOnExit = (findings: VerifierFindings): VerifierFindings => {
    try {
      recordPhaseDuration("verifier", Date.now() - verifierStartedAt);
      // Per-finding counter so the audit §3.1 question ("how often do
      // FORCE_BLOCKING_IDS actually fire?") becomes a queryable metric.
      // Only counts blocking findings — quality is advisory anyway.
      for (const f of findings.blocking) incVerifierBlocking(f.id);
    } catch {
      // Telemetry must never break verification.
    }
    return findings;
  };

  if (!isVerifierPassEnabled()) {
    return recordOnExit(EMPTY_VERIFIER_FINDINGS);
  }

  const { files } = parseCodeProject(codeProjectContent);
  const motionTraps = checkMotionReduceTrap(files);
  const r3fClientBoundary = checkR3FClientBoundary(files);
  const undefinedJsx = checkUndefinedJsxSymbols(files);
  const navigationPlaceholders = checkNavigationPlaceholderActions(files);
  const deterministic: VerifierFindings = {
    blocking: [...motionTraps, ...r3fClientBoundary, ...undefinedJsx, ...navigationPlaceholders],
    quality: [],
  };

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasKey) {
    return recordOnExit(deterministic);
  }

  const cfg = resolvePostGenerationVerifierConfig();
  const modelId = resolvePhaseModel(opts.resolvedTier, "verifier").modelId;
  const thinkingConfig = resolvePhaseThinking(opts.resolvedTier, "verifier");

  const snippet = buildVerifierPromptSnippetFromFiles(files, cfg.snippetCharsPerFile);
  if (!snippet.trim()) {
    return recordOnExit(deterministic);
  }

  const system = `You are a read-only QA reviewer for a generated Next.js site (CodeProject).
Return structured findings only. Do not output code fixes.
- blocking: issues that likely break build, types, imports, or critical runtime (wrong paths, missing exports, obvious TS errors). Put file paths inside detail when relevant.
- quality: important but non-blocking (a11y gaps, weak SEO, fragile patterns).

NOT blocking (do not flag these as blocking even if they look like placeholder navigation):
- Hash anchor links (href="#some-id") when there is a matching id="some-id" element in the same page route. These are valid in-page navigation, especially on game/interactive routes.
- "Skip to content"-style accessibility anchors.

The following production-quality issues MUST be reported as blocking (not quality), because they break the user-facing contract of a marketing/SaaS site even when the build succeeds:
- CTA / primary buttons or links that have no real destination (no \`href\`, \`href="#"\`, empty \`href\`, or no \`onClick\`). Use the id "navigation-placeholder-actions" and list the file + element labels in detail.
- Footer links pointing to \`href="#"\` or empty href. Use the id "footer-dead-links" and list the file in detail.
Detail format discipline:
- detail: max 2 sentences. Cite file path and element label or selector only. No advice/suggestions preamble. No reasoning prose. Bad: "I would suggest reviewing the navigation because the CTA seems weak". Good: "components/hero.tsx Button label='Boka demo'".
Use those exact ids so downstream tooling can recognise them.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
  // Forward an external abortSignal (e.g. verifier-phase rerun timeout) into
  // the same controller so the caller can actually cancel the verifier call,
  // not just the wrapper.
  const externalAbort = opts.abortSignal;
  const onExternalAbort = () => controller.abort();
  if (externalAbort) {
    if (externalAbort.aborted) {
      controller.abort();
    } else {
      externalAbort.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  let providerOptions: ProviderOptionsRecord | undefined;
  if (thinkingConfig.thinking) {
    providerOptions = isAnthropicModel(modelId)
      ? {
          anthropic: {
            thinking: { type: "adaptive" as const },
            effort: toAnthropicEffort(thinkingConfig.reasoningEffort),
          },
        }
      : {
          openai: { reasoningEffort: thinkingConfig.reasoningEffort },
        };
  }

  try {
    const result = await generateObject({
      model: getOpenAIModel(modelId),
      schema: VerifierFindingsSchema,
      system,
      prompt: `Review this generated project (snippets may be truncated):\n\n${snippet}`,
      maxOutputTokens: cfg.maxOutputTokens,
      abortSignal: controller.signal,
      // Bound retries — verifier is read-only and skipped on failure, so wasting
      // 8+ seconds re-attempting non-transient errors (e.g. insufficient_quota,
      // rate_limit_exceeded, context_length_exceeded — see SAJ-5/B2) is pure
      // latency cost. AI SDK default is 2; cap at 1 and rely on the catch
      // block to short-circuit on the next call.
      maxRetries: 1,
      ...(providerOptions ? { providerOptions } : {}),
    });
    const promoted = suppressValidInPageAnchorNavigationFindings(
      promoteForcedBlockingFindings(result.object),
      files,
    );
    return recordOnExit({
      blocking: [...deterministic.blocking, ...promoted.blocking],
      quality: [...deterministic.quality, ...promoted.quality],
    });
  } catch (err) {
    if (isNonRetryableProviderError(err)) {
      console.warn("[verifier-pass] Non-retryable provider error, skipping:", summariseProviderError(err));
    } else {
      console.warn("[verifier-pass] Non-fatal error, skipping:", err);
    }
    return recordOnExit(deterministic);
  } finally {
    clearTimeout(timeoutId);
    if (externalAbort) {
      externalAbort.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Classify provider errors that are NOT worth retrying — quota, auth,
 * context-length etc. The verifier already retries once on transient errors;
 * this helper just gives a clearer log line and signals to future callers
 * (via NON_RETRYABLE_PROVIDER_CODES) which conditions should be treated as
 * permanent within a single generation.
 */
const NON_RETRYABLE_PROVIDER_CODES = new Set([
  "insufficient_quota",
  "rate_limit_exceeded",
  "context_length_exceeded",
  "invalid_api_key",
  "permission_denied",
]);

function isNonRetryableProviderError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; statusCode?: number; code?: string; data?: { error?: { code?: string } } };
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : undefined;
  const code = typeof e.code === "string" ? e.code : e.data?.error?.code;
  if (status && [401, 402, 403].includes(status)) return true;
  if (status === 429 && code && NON_RETRYABLE_PROVIDER_CODES.has(code)) return true;
  if (code && NON_RETRYABLE_PROVIDER_CODES.has(code)) return true;
  return false;
}

function summariseProviderError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as { status?: number; code?: string; message?: string };
  const parts = [e.code, e.status ? `status=${e.status}` : null, e.message].filter(Boolean);
  return parts.join(" | ");
}
