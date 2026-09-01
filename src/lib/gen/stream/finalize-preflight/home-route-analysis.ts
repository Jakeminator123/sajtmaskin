import { createIssue, type FinalizePreflightIssue } from "./issues";

/**
 * Plan 11 / open-question #5 hard gate: the user-visible Home route must
 * always exist with non-trivial content after preflight assembly.
 *
 * `LLM_ONLY_PATHS` in `finalize-merge.ts` deliberately strips
 * `app/page.tsx` from the scaffold base so the LLM is forced to emit a
 * branded version; without a safety net here, an LLM that forgets the
 * file ships a 6-file project with an empty `<main>` to disk (Run A +
 * Run B in `STATUS-INVESTIGATE-PAGETSX-LOSS.md`). We block persist with
 * `code_structure_failure` instead of letting that happen silently.
 *
 * "Non-trivial" = > 200 chars of rendered content body after stripping
 * imports, exports, and JSX braces. Picked empirically from observed
 * "blank" pages (~80–120 chars of import + skeleton vs ~600+ for any
 * real branded landing).
 *
 * The measure is composition-aware: a modern App Router home page often
 * delegates its body to a local section/page component
 * (`return <PalmaGuide />`), leaving little inline text in `app/page.tsx`
 * itself. Counting the page file in isolation then mis-flags a perfectly
 * real, content-rich site as "trivial/blank" and forces a manual "Fixa
 * projekt" re-run. `measureComposedHomeRenderedLength` therefore also
 * counts the rendered content of local components that are imported AND
 * rendered as JSX in the page, so a sparse-but-composing page passes while
 * a truly empty `<main />` is still blocked.
 */
const HOME_PAGE_MIN_RENDERED_CHARS = 200;
const HOME_PAGE_REQUIRED_PATHS = ["app/page.tsx", "src/app/page.tsx"] as const;

function measureRenderedContentLength(content: string): number {
  // Strip imports/exports + obvious whitespace so a 60-line file of
  // imports + a `return null` doesn't count as "content".
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*import[^;]*;?\s*$/gm, "")
    .replace(/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var)\s/gm, "")
    .replace(/[{}();,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length;
}

/**
 * Local (non-package) import sources that may resolve to a generated
 * component file in the same project. Package imports (e.g. `next/link`,
 * `lucide-react`) are ignored because their content does not live in the
 * generated file set.
 *
 * Only `@/` (the alias the generated tsconfig actually configures — see
 * `src/lib/gen/export/project-scaffold.ts`) and relative paths are treated
 * as resolvable. `~/` is intentionally NOT supported: the generated project
 * cannot resolve it at build/preview time, so counting a `~/`-imported
 * component would let a thin home page pass the gate while runtime fails.
 */
const LOCAL_IMPORT_PREFIX = /^(?:\.\.?\/|@\/)/;

type LocalComponentImport = { source: string; exportName: string };

/**
 * Parse local-component imports from a page module, mapping each imported
 * binding name (the identifier used in JSX) to its module source AND the
 * name it is exported under (`"default"` for default imports, the original
 * name for `{ Foo as Bar }`). The export name lets us measure only the
 * rendered component, not unrelated module-level exports/data.
 */
function parseLocalComponentImports(content: string): Map<string, LocalComponentImport> {
  const map = new Map<string, LocalComponentImport>();
  const importRe =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    const [, defaultName, named, source] = match;
    if (!source || !LOCAL_IMPORT_PREFIX.test(source)) continue;
    if (defaultName) map.set(defaultName, { source, exportName: "default" });
    if (named) {
      for (const part of named.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const [original, alias] = trimmed.split(/\s+as\s+/).map((s) => s.trim());
        const binding = alias || original;
        if (binding) map.set(binding, { source, exportName: original });
      }
    }
  }
  return map;
}

function posixDirname(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}

function resolveRelativeImport(fromPath: string, relative: string): string {
  const segments = `${posixDirname(fromPath)}/${relative}`.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/**
 * Resolve an import source from `fromPath` to a file in the generated set.
 * Supports the `@/` root alias (with and without a `src/` prefix) plus
 * relative paths, trying common TS/JS extensions and `index` files.
 */
function resolveImportToFile(
  source: string,
  fromPath: string,
  byNorm: Map<string, { path: string; content: string }>,
): { path: string; content: string } | null {
  let base: string;
  if (source.startsWith("@/")) {
    base = source.slice(2);
  } else if (source.startsWith("./") || source.startsWith("../")) {
    base = resolveRelativeImport(fromPath, source);
  } else {
    return null;
  }
  base = base.replace(/^\/+/, "");
  if (!base) return null;
  const exts = [".tsx", ".ts", ".jsx", ".js"];
  const bases = base.startsWith("src/") ? [base] : [base, `src/${base}`];
  const candidates: string[] = [];
  for (const candidateBase of bases) {
    candidates.push(candidateBase);
    for (const ext of exts) candidates.push(`${candidateBase}${ext}`);
    for (const ext of exts) candidates.push(`${candidateBase}/index${ext}`);
  }
  for (const candidate of candidates) {
    const hit = byNorm.get(candidate);
    if (hit) return hit;
  }
  return null;
}

/**
 * Find a balanced `{...}` / `(...)` / `[...]` range starting at the first
 * opening delimiter at or after `fromIndex`. String/template literals are
 * skipped so delimiters inside them do not break the balance. Returns the
 * inclusive `[start, end]` indices, or `null` if none is found.
 */
function findBalancedRange(
  content: string,
  fromIndex: number,
): { start: number; end: number } | null {
  const openers: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  let start = -1;
  for (let i = fromIndex; i < content.length; i++) {
    if (openers[content[i]]) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (openers[ch]) {
      stack.push(openers[ch]);
    } else if (ch === "}" || ch === ")" || ch === "]") {
      if (stack.pop() !== ch) return { start, end: i };
      if (stack.length === 0) return { start, end: i };
    }
  }
  // Reached EOF with an open delimiter still on the stack: the input is
  // unbalanced (truncated/malformed). Fail closed rather than returning a
  // span to EOF, which would let unrelated trailing module text inflate the
  // measured component body and slip a thin home route past the gate.
  return null;
}

function captureBalancedBlock(content: string, fromIndex: number): string | null {
  const range = findBalancedRange(content, fromIndex);
  return range ? content.slice(range.start, range.end + 1) : null;
}

/** Capture a function body `{...}`, skipping the parameter list `(...)`. */
function captureFunctionBody(content: string, afterName: number): string | null {
  const params = findBalancedRange(content, afterName);
  const bodyFrom = params ? params.end + 1 : afterName;
  return captureBalancedBlock(content, bodyFrom);
}

/** Capture an arrow function's body (block, parenthesized JSX, or expression). */
function captureAfterArrow(content: string, afterArrow: number): string | null {
  let i = afterArrow;
  while (i < content.length && /\s/.test(content[i])) i++;
  const ch = content[i];
  if (ch === "{" || ch === "(") return captureBalancedBlock(content, i);
  const rest = content.slice(i);
  return rest.split(/;\s*\n|\n\s*\n/)[0] ?? null;
}

type ExtractedExport =
  | { kind: "measured"; source: string }
  /** Export declaration exists but its body could not be captured (unbalanced). */
  | { kind: "declaration-found" }
  /** The expected export (default or named) is not in the module. */
  | { kind: "not-found" };

function measuredOrDeclaration(source: string | null): ExtractedExport {
  return source ? { kind: "measured", source } : { kind: "declaration-found" };
}

const HOC_WRAPPER_RE = /(?:React\.)?(?:memo|forwardRef)/;

function skipWs(content: string, index: number): number {
  let i = index;
  while (i < content.length && /\s/.test(content[i])) i++;
  return i;
}

/**
 * Measure the inner component of `memo(X)` / `forwardRef(X)` /
 * `memo(function X() { ... })` / `forwardRef((props, ref) => ...)`.
 */
function extractFromHocCall(content: string, afterOpenParen: number): ExtractedExport {
  const i = skipWs(content, afterOpenParen);
  const slice = content.slice(i);
  const fnKw = /^(?:async\s+)?function\b/.exec(slice);
  if (fnKw) {
    const body = captureFunctionBody(content, i + fnKw[0].length);
    return measuredOrDeclaration(body ? `${fnKw[0]} ${body}` : null);
  }
  if (slice.startsWith("(")) {
    const arrowIdx = content.indexOf("=>", i);
    if (arrowIdx !== -1) {
      return measuredOrDeclaration(captureAfterArrow(content, arrowIdx + 2));
    }
  }
  const ident = /^([A-Za-z_$][\w$]*)/.exec(slice);
  if (ident) {
    return extractExportedComponentSource(content, ident[1]);
  }
  return { kind: "declaration-found" };
}

function extractAfterEquals(content: string, eqIdx: number): ExtractedExport {
  const afterEq = skipWs(content, eqIdx + 1);
  const hoc = new RegExp(`^${HOC_WRAPPER_RE.source}\\s*\\(`).exec(content.slice(afterEq));
  if (hoc) {
    return extractFromHocCall(content, afterEq + hoc[0].length);
  }
  const arrowIdx = content.indexOf("=>", afterEq);
  if (arrowIdx !== -1) {
    return measuredOrDeclaration(captureAfterArrow(content, arrowIdx + 2));
  }
  const block = captureBalancedBlock(content, afterEq);
  return measuredOrDeclaration(block ?? content.slice(afterEq).split(/\n\s*\n/)[0] ?? null);
}

/**
 * `export { default } from "./x"` / `export { Foo as default } from "./x"` /
 * `export { Foo } from "./x"`. One hop — the caller resolves `source`.
 */
function parseBarrelReexport(
  rawContent: string,
  exportName: string,
): { source: string; exportName: string } | null {
  const content = rawContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const re = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const specs = match[1];
    const source = match[2];
    for (const part of specs.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [original, alias] = trimmed.split(/\s+as\s+/).map((s) => s.trim());
      const exportedAs = alias || original;
      if (exportedAs === exportName && original) {
        return { source, exportName: original };
      }
    }
  }
  return null;
}

/**
 * Extract the source of a specific exported component (`exportName`, or
 * `"default"`) from a module, so we can measure only the rendered component
 * and not unrelated module-level exports/data arrays.
 *
 * `not-found` means the expected export is missing. The caller fails closed
 * (count 0) after trying HOC unwrap, local binding name, and one barrel hop —
 * a missing export is no longer a free pass.
 * `declaration-found` means we located the export but could not capture a
 * balanced body; also count 0 so trailing module text cannot inflate.
 */
function extractExportedComponentSource(
  rawContent: string,
  exportName: string,
): ExtractedExport {
  // Strip comments before delimiter scanning so braces/quotes inside
  // comments (e.g. `/* } */` or `// it's`) cannot confuse the balance
  // matcher and mis-measure the component body.
  const content = rawContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  let name = exportName;
  if (name === "default") {
    const directFn = /export\s+default\s+(?:async\s+)?function\b/.exec(content);
    if (directFn) {
      const body = captureFunctionBody(content, directFn.index + directFn[0].length);
      return measuredOrDeclaration(body ? `${directFn[0]} ${body}` : null);
    }
    const directArrow = /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>/.exec(content);
    if (directArrow) {
      return measuredOrDeclaration(
        captureAfterArrow(content, directArrow.index + directArrow[0].length),
      );
    }
    const hocDefault = new RegExp(
      `export\\s+default\\s+${HOC_WRAPPER_RE.source}\\s*\\(`,
    ).exec(content);
    if (hocDefault) {
      return extractFromHocCall(content, hocDefault.index + hocDefault[0].length);
    }
    const refDefault = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/.exec(content);
    if (refDefault) {
      name = refDefault[1];
    } else {
      return { kind: "not-found" };
    }
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnDecl = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`).exec(content);
  if (fnDecl) {
    const body = captureFunctionBody(content, fnDecl.index + fnDecl[0].length);
    return measuredOrDeclaration(body ? `${fnDecl[0]} ${body}` : null);
  }
  const constDecl = new RegExp(`(?:export\\s+)?const\\s+${escaped}\\b`).exec(content);
  if (constDecl) {
    const after = constDecl.index + constDecl[0].length;
    const eqIdx = content.indexOf("=", after);
    if (eqIdx !== -1) {
      return extractAfterEquals(content, eqIdx);
    }
    return { kind: "declaration-found" };
  }
  return { kind: "not-found" };
}

/**
 * Composition-aware home-route content measure. For each local component
 * that is BOTH imported and rendered as JSX in the page, resolve the file
 * and measure ONLY the rendered export's body (not the whole module), so a
 * large unrelated module-level export/data array cannot inflate the count
 * past the gate. One level deep — enough to distinguish a real composed
 * page from an empty `<main />` whose delegated component is also empty.
 *
 * If a rendered local file resolves but the expected export still cannot
 * be located after HOC unwrap, local-name fallback and one barrel hop,
 * contribute 0 (fail closed). A missing export is not a free pass.
 */
function measureResolvedExport(
  file: { path: string; content: string },
  exportName: string,
  localName: string,
  byNorm: Map<string, { path: string; content: string }>,
  hop = 0,
): ExtractedExport {
  let extracted = extractExportedComponentSource(file.content, exportName);
  if (extracted.kind === "not-found" && exportName === "default" && localName !== "default") {
    extracted = extractExportedComponentSource(file.content, localName);
  }
  if (extracted.kind === "not-found" && hop < 1) {
    const barrel = parseBarrelReexport(file.content, exportName);
    if (barrel && LOCAL_IMPORT_PREFIX.test(barrel.source)) {
      const next = resolveImportToFile(barrel.source, file.path, byNorm);
      if (next) {
        return measureResolvedExport(next, barrel.exportName, localName, byNorm, hop + 1);
      }
    }
  }
  return extracted;
}

function measureComposedHomeRenderedLength(
  home: { path: string; content: string },
  files: Array<{ path: string; content: string }>,
): { renderedLength: number } {
  let total = measureRenderedContentLength(home.content);
  const imports = parseLocalComponentImports(home.content);
  if (imports.size === 0) {
    return { renderedLength: total };
  }
  const byNorm = new Map(
    files.map((file) => [file.path.replace(/\\/g, "/"), file]),
  );
  const counted = new Set<string>();
  for (const [name, info] of imports) {
    const renderedAsJsx = new RegExp(`<${name}(?=[\\s/>])`).test(home.content);
    if (!renderedAsJsx) continue;
    const file = resolveImportToFile(info.source, home.path, byNorm);
    if (!file) continue;
    const key = `${file.path.replace(/\\/g, "/")}#${info.exportName}`;
    if (counted.has(key)) continue;
    counted.add(key);
    const extracted = measureResolvedExport(file, info.exportName, name, byNorm);
    if (extracted.kind === "measured") {
      total += measureRenderedContentLength(extracted.source);
    }
    // not-found / declaration-found: contribute 0. Fail closed so an empty
    // memo()/forwardRef()/barrel cannot slip a thin home past the gate.
  }
  return { renderedLength: total };
}

export function findHomePageFile(
  files: Array<{ path: string; content: string }>,
): { path: string; content: string } | null {
  const wantsNorm = new Set<string>(HOME_PAGE_REQUIRED_PATHS);
  for (const file of files) {
    const norm = file.path.replace(/\\/g, "/");
    if (wantsNorm.has(norm)) return { path: norm, content: file.content };
  }
  return null;
}

export function buildMissingHomeRouteIssue(
  detected: { path: string; content: string } | null,
  allFiles?: Array<{ path: string; content: string }>,
): FinalizePreflightIssue | null {
  if (!detected) {
    return createIssue(
      "app/page.tsx",
      "error",
      "Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it.",
      "code_structure_failure",
    );
  }
  if (allFiles) {
    const composed = measureComposedHomeRenderedLength(detected, allFiles);
    if (composed.renderedLength < HOME_PAGE_MIN_RENDERED_CHARS) {
      return createIssue(
        detected.path,
        "error",
        `Home route renders trivial content (≈${composed.renderedLength} chars after stripping imports/JSX braces; threshold ${HOME_PAGE_MIN_RENDERED_CHARS}). Likely empty <main> or skeleton-only output. Block persist instead of shipping a blank site.`,
        "code_structure_failure",
      );
    }
    return null;
  }
  const renderedLength = measureRenderedContentLength(detected.content);
  if (renderedLength < HOME_PAGE_MIN_RENDERED_CHARS) {
    return createIssue(
      detected.path,
      "error",
      `Home route renders trivial content (≈${renderedLength} chars after stripping imports/JSX braces; threshold ${HOME_PAGE_MIN_RENDERED_CHARS}). Likely empty <main> or skeleton-only output. Block persist instead of shipping a blank site.`,
      "code_structure_failure",
    );
  }
  return null;
}
