// Read-only static audit for Template (v0-mall) ZIP archives.
//
// The auditor never installs dependencies, starts a dev server, or extracts archive
// members.  `--dir` is the preferred integration point for the Backoffice curator:
// Python verifies and stages selected Blob archives, then this canonical Node audit
// reads only bounded metadata and a bounded set of text files.

import JSZip from "jszip";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, stat, open, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, isAbsolute, basename } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import os from "node:os";

const MiB = 1024 * 1024;
const HOST_MAX_FILES = 500;
const HOST_MAX_FILE_BYTES = 2 * MiB;
const HOST_MAX_TOTAL_BYTES = 12 * MiB;
const MAX_ARCHIVE_BYTES = 50 * MiB;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_FILE_BYTES = 16 * MiB;
const MAX_ZIP_TOTAL_BYTES = 96 * MiB;
const MAX_COMPRESSION_RATIO = 250;
const MAX_PACKAGE_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SOURCE_SCAN_TOTAL = 8 * MiB;
const MAX_DEPENDENCIES = 1_000;
const MAX_ENV_EVIDENCE = 200;
const MAX_ENV_EVIDENCE_PER_KEY = 4;
const MAX_ENV_EVIDENCE_PER_FILE = 40;
const FETCH_TIMEOUT_MS = 30_000;
const BASELINE = { next: 16, react: 19, tailwind: 4, typescript: "5.9.3" };
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA_RE = /^[a-f0-9]{64}$/;

const BLOCKED_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
];
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|astro|svelte)$/i;
const DOT_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const BRACKET_ENV_RE = /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;
const DOT_IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
const BRACKET_IMPORT_META_ENV_RE = /import\.meta\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;
const SVELTE_NAMED_ENV_IMPORT_RE =
  /\bimport\s*\{([^}]{1,4096})\}\s*from\s*(["'])\$env\/(static|dynamic)\/(private|public)\2/g;
const SVELTE_NAMESPACE_ENV_IMPORT_RE =
  /\bimport\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*(["'])\$env\/(static|dynamic)\/(private|public)\1/g;
const SVELTE_NAMED_ENV_REQUIRE_RE =
  /\b(?:const|let|var)\s*\{([^}]{1,4096})\}\s*=\s*require\s*\(\s*(["'])\$env\/(static|dynamic)\/(private|public)\2\s*\)/g;
const SVELTE_NAMESPACE_ENV_REQUIRE_RE =
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\s*\(\s*(["'])\$env\/(static|dynamic)\/(private|public)\1\s*\)/g;
const IMPORT_META_BUILTIN_ENV_KEYS = new Set(["MODE", "BASE_URL", "PROD", "DEV", "SSR"]);
const BUILTIN_ENV_KEYS = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "NEXT_RUNTIME",
  "PORT",
  "HOSTNAME",
  "PATH",
]);
const PROJECT_PREVIEW_ENV_KEYS = [
  "NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID",
  "SAJTMASKIN_APP_PROJECT_ID",
  "PREVIEW_PROJECT_SECRET",
  "NEXT_PUBLIC_PREVIEW_KEY",
  "PREVIEW_API_KEY",
  "PREVIEW_INTEGRATION_TOKEN",
];
let COVERED_ENV = new Set();

const INTEGRATION_MAP = {
  auth: [
    /^@clerk\//,
    /^next-auth$/,
    /^@auth\//,
    /^@supabase\/auth-helpers/,
    /^lucia$/,
    /^@workos-inc\//,
    /^@kinde-oss\//,
    /^@auth0\//,
    /^@stackframe\//,
  ],
  payments: [/^stripe$/, /^@stripe\//, /^@paddle\//, /^@lemonsqueezy\//],
  database: [
    /^@supabase\/supabase-js$/,
    /^@prisma\/client$/,
    /^prisma$/,
    /^drizzle-orm$/,
    /^mongoose$/,
    /^@neondatabase\//,
    /^pg$/,
    /^mysql2$/,
    /^@planetscale\//,
    /^mongodb$/,
    /^@vercel\/postgres$/,
    /^@upstash\//,
    /^redis$/,
    /^ioredis$/,
  ],
  ai: [
    /^openai$/,
    /^@ai-sdk\//,
    /^ai$/,
    /^@anthropic-ai\//,
    /^@google\/generative-ai$/,
    /^replicate$/,
    /^cohere-ai$/,
    /^groq-sdk$/,
  ],
  email: [/^resend$/, /^nodemailer$/, /^@sendgrid\//, /^postmark$/],
  cms: [
    /^contentful$/,
    /^@sanity\//,
    /^next-sanity$/,
    /^@contentful\//,
    /^@storyblok\//,
    /^@prismicio\//,
  ],
  storage: [/^@vercel\/blob$/, /^@aws-sdk\/client-s3$/, /^@uploadthing\//, /^uploadthing$/],
};
const CROSS_FRAMEWORK = [
  /^svelte$/,
  /^@sveltejs\//,
  /^vue$/,
  /^vue-router$/,
  /^@remix-run\//,
  /^solid-js$/,
  /^@angular\//,
  /^nuxt$/,
  /^@builder\.io\/qwik$/,
];
const MOTION_PARENTS = ["framer-motion", "motion"];
const MOTION_LOCKSTEP = new Set([...MOTION_PARENTS, "motion-dom", "motion-utils"]);

function parseArgs(argv) {
  const args = {
    dir: null,
    limit: Infinity,
    out: "scratch-template-audit.json",
    concurrency: 8,
    cache: join(os.tmpdir(), "sm-template-audit-cache"),
    noCache: false,
    quiet: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dir") args.dir = argv[++i];
    else if (token === "--limit") args.limit = positiveInt(argv[++i], "--limit");
    else if (token === "--out") args.out = argv[++i];
    else if (token === "--concurrency") args.concurrency = positiveInt(argv[++i], "--concurrency");
    else if (token === "--cache") args.cache = argv[++i];
    else if (token === "--no-cache") args.noCache = true;
    else if (token === "--quiet") args.quiet = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  args.concurrency = Math.min(args.concurrency, 32);
  return args;
}

function positiveInt(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function safeArchivePath(name) {
  if (typeof name !== "string" || !name || name.includes("\0") || name.includes("\\")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  const parts = name.replace(/\/$/, "").split("/");
  return !parts.some((part) => part === ".." || part === "");
}

function stripCommonRoot(names) {
  if (!names.length) return names;
  const segments = names.map((name) => name.split("/").filter(Boolean));
  const first = segments[0]?.[0];
  return first && segments.every((parts) => parts.length > 1 && parts[0] === first)
    ? segments.map((parts) => parts.slice(1).join("/"))
    : names;
}

function majorOf(range) {
  if (typeof range !== "string") return null;
  const match = range.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function isExactPin(range) {
  return typeof range === "string" && /^\s*=?\d+\.\d+\.\d+(?:[-+].*)?\s*$/.test(range);
}

function bucketForDep(name) {
  for (const [bucket, patterns] of Object.entries(INTEGRATION_MAP)) {
    if (patterns.some((pattern) => pattern.test(name))) return bucket;
  }
  return null;
}

function boundedStringMap(value, label, issues) {
  const isDependencyGroup = label === "dependencies" || label === "devDependencies";
  const issuePrefix = isDependencyGroup ? "dependencies-invalid" : `${label}-invalid`;
  if (value === undefined) return {};
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    issues.push(`${issuePrefix}-shape`);
    return {};
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_DEPENDENCIES) {
    issues.push(`${issuePrefix}-count`);
    return {};
  }
  const result = {};
  for (const [key, raw] of entries) {
    if (
      typeof key !== "string" ||
      key.length > 214 ||
      typeof raw !== "string" ||
      raw.length > 256
    ) {
      issues.push(`${issuePrefix}-entry`);
      continue;
    }
    result[key] = raw;
  }
  return result;
}

// Replace comments and literal text with equal-length spaces. Template expression code
// is preserved while the surrounding literal is masked. The stack-based lexer visits
// each source character at most once, including nested template expressions.
// Regex literals are a distinct state so quotes inside `/["']/` cannot swallow
// later `process.env` / `import.meta.env` reads.
const REGEX_PREFIX_CHARS = new Set("=(,;:!&|?+-*%^~[{".split(""));
const REGEX_KEYWORD_PREFIXES = new Set([
  "return",
  "throw",
  "case",
  "else",
  "do",
  "typeof",
  "void",
  "yield",
  "await",
  "new",
  "delete",
  "in",
  "of",
]);

function codeView(source) {
  const out = new Array(source.length);
  const stack = [{ kind: "code", templateExpression: false, braceDepth: 0 }];
  let regexAllowed = true;
  let ident = "";
  const finishIdent = () => {
    if (ident && REGEX_KEYWORD_PREFIXES.has(ident)) regexAllowed = true;
    ident = "";
  };
  const noteCodeChar = (emitted) => {
    if (/[A-Za-z_$]/u.test(emitted)) {
      ident += emitted;
      regexAllowed = false;
      return;
    }
    if (ident && /[0-9]/u.test(emitted)) {
      ident += emitted;
      regexAllowed = false;
      return;
    }
    if (/\s/u.test(emitted)) {
      finishIdent();
      return;
    }
    finishIdent();
    regexAllowed = REGEX_PREFIX_CHARS.has(emitted);
  };
  const enterNonCode = () => {
    finishIdent();
    regexAllowed = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i],
      next = source[i + 1];
    const state = stack[stack.length - 1];
    if (state.kind === "code") {
      if (state.templateExpression && char === "}" && state.braceDepth === 0) {
        out[i] = " ";
        stack.pop();
        continue;
      }
      if (char === "/" && next === "/") {
        enterNonCode();
        out[i] = out[i + 1] = " ";
        i++;
        stack.push({ kind: "line" });
        continue;
      }
      if (char === "/" && next === "*") {
        enterNonCode();
        out[i] = out[i + 1] = " ";
        i++;
        stack.push({ kind: "block" });
        continue;
      }
      if (char === "/" && regexAllowed) {
        enterNonCode();
        out[i] = " ";
        stack.push({ kind: "re", inClass: false });
        continue;
      }
      if (char === "'") {
        enterNonCode();
        out[i] = " ";
        stack.push({ kind: "sq" });
        continue;
      }
      if (char === '"') {
        enterNonCode();
        out[i] = " ";
        stack.push({ kind: "dq" });
        continue;
      }
      if (char === "`") {
        enterNonCode();
        out[i] = " ";
        stack.push({ kind: "tpl" });
        continue;
      }
      if (state.templateExpression) {
        if (char === "{") state.braceDepth++;
        else if (char === "}") state.braceDepth--;
      }
      out[i] = char;
      noteCodeChar(char);
      continue;
    }
    if (state.kind === "line") {
      out[i] = char === "\n" ? "\n" : " ";
      if (char === "\n") {
        stack.pop();
        regexAllowed = true;
      }
      continue;
    }
    if (state.kind === "block") {
      if (char === "*" && next === "/") {
        out[i] = out[i + 1] = " ";
        i++;
        stack.pop();
        regexAllowed = true;
      } else out[i] = char === "\n" ? "\n" : " ";
      continue;
    }
    if (state.kind === "re") {
      if (char === "\\") {
        out[i] = " ";
        if (i + 1 < source.length) out[++i] = " ";
        continue;
      }
      if (state.inClass) {
        out[i] = char === "\n" ? "\n" : " ";
        if (char === "]") state.inClass = false;
        continue;
      }
      if (char === "[") {
        out[i] = " ";
        state.inClass = true;
        continue;
      }
      out[i] = char === "\n" ? "\n" : " ";
      if (char === "/") stack.pop();
      continue;
    }
    if (char === "\\") {
      out[i] = " ";
      if (i + 1 < source.length) out[++i] = " ";
      continue;
    }
    if (state.kind === "tpl" && char === "$" && next === "{") {
      out[i] = out[i + 1] = " ";
      i++;
      stack.push({ kind: "code", templateExpression: true, braceDepth: 0 });
      regexAllowed = true;
      ident = "";
      continue;
    }
    const closes =
      (state.kind === "sq" && char === "'") ||
      (state.kind === "dq" && char === '"') ||
      (state.kind === "tpl" && char === "`");
    out[i] = char === "\n" ? "\n" : " ";
    if (closes) {
      stack.pop();
      regexAllowed = false;
      ident = "";
    }
  }
  return out.join("");
}

function copyScriptBodies(source, copyRange) {
  const lower = source.toLowerCase();
  let cursor = 0;
  while (cursor < source.length) {
    const commentStart = lower.indexOf("<!--", cursor);
    const scriptStart = lower.indexOf("<script", cursor);
    if (scriptStart < 0) break;
    if (commentStart >= 0 && commentStart < scriptStart) {
      const commentEnd = lower.indexOf("-->", commentStart + 4);
      cursor = commentEnd < 0 ? source.length : commentEnd + 3;
      continue;
    }
    const afterName = lower[scriptStart + "<script".length];
    if (afterName && !/[\s/>]/.test(afterName)) {
      cursor = scriptStart + "<script".length;
      continue;
    }
    let tagEnd = scriptStart + "<script".length;
    let quote = null;
    for (; tagEnd < source.length; tagEnd++) {
      const char = source[tagEnd];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (tagEnd >= source.length) break;
    const bodyEnd = lower.indexOf("</script", tagEnd + 1);
    if (bodyEnd < 0) break;
    copyRange(tagEnd + 1, bodyEnd);
    const closeEnd = lower.indexOf(">", bodyEnd + "</script".length);
    cursor = closeEnd < 0 ? source.length : closeEnd + 1;
  }
}

// Astro and Svelte mix markup with executable source. Only frontmatter and script
// bodies are copied into this equal-length view, so prose and HTML comments cannot
// masquerade as env access while all scan/evidence offsets remain stable.
function executableSourceView(source, file) {
  if (!/\.(?:astro|svelte)$/i.test(file)) return source;
  const out = new Array(source.length).fill(" ");
  const copyRange = (start, end) => {
    for (let index = start; index < end; index++) out[index] = source[index];
  };
  if (/\.astro$/i.test(file)) {
    const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(source);
    if (opening) {
      let lineStart = opening[0].length;
      while (lineStart <= source.length) {
        const newline = source.indexOf("\n", lineStart);
        const lineEnd = newline < 0 ? source.length : newline;
        if (source.slice(lineStart, lineEnd).replace(/\r$/, "").trim() === "---") {
          copyRange(opening[0].length, lineStart);
          break;
        }
        if (newline < 0) break;
        lineStart = newline + 1;
      }
    }
  }
  copyScriptBodies(source, copyRange);
  return out.join("");
}

function isFunctionBraceBounded(view, position) {
  const start = Math.max(0, position - 512);
  const before = view.slice(start, position).trimEnd();
  if (/=>\s*$/.test(before)) return true;
  if (!before.endsWith(")"))
    return /(?:^|\W)(?:function|constructor|get|set)\s+[\w$]*\s*$/.test(before);
  let depth = 0;
  let openPos = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ")") depth++;
    else if (before[i] === "(" && --depth === 0) {
      openPos = i;
      break;
    }
  }
  if (openPos < 0) return false;
  const prefix = before.slice(0, openPos).trimEnd();
  const word = prefix.match(/([A-Za-z_$][\w$]*)$/)?.[1] ?? "";
  if (["if", "for", "while", "switch", "catch", "with"].includes(word)) return false;
  return word === "function" || /(?:function\s+[\w$]*|[A-Za-z_$][\w$]*|\))$/.test(prefix);
}

function functionDepthAt(view, positions) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const result = new Map();
  const stack = [];
  const expressionArrows = [];
  let functionDepth = 0,
    cursor = 0,
    parenDepth = 0,
    bracketDepth = 0,
    braceDepth = 0,
    pendingArrow = false;

  const atOrOutside = (context) =>
    parenDepth <= context.parenDepth &&
    bracketDepth <= context.bracketDepth &&
    braceDepth <= context.braceDepth;

  for (const target of sorted) {
    while (cursor < target) {
      const char = view[cursor],
        next = view[cursor + 1];
      if (char === "=" && next === ">") {
        pendingArrow = true;
        cursor += 2;
        continue;
      }
      if (pendingArrow && !/\s/.test(char)) {
        if (char !== "{") expressionArrows.push({ parenDepth, bracketDepth, braceDepth });
        pendingArrow = false;
      }

      if (char === ";") {
        while (expressionArrows.length && atOrOutside(expressionArrows.at(-1)))
          expressionArrows.pop();
      } else if (char === ",") {
        while (expressionArrows.length && atOrOutside(expressionArrows.at(-1)))
          expressionArrows.pop();
      } else if (char === ")") {
        while (
          expressionArrows.length &&
          parenDepth <= expressionArrows.at(-1).parenDepth &&
          bracketDepth <= expressionArrows.at(-1).bracketDepth &&
          braceDepth <= expressionArrows.at(-1).braceDepth
        )
          expressionArrows.pop();
      } else if (char === "]") {
        while (
          expressionArrows.length &&
          bracketDepth <= expressionArrows.at(-1).bracketDepth &&
          parenDepth <= expressionArrows.at(-1).parenDepth &&
          braceDepth <= expressionArrows.at(-1).braceDepth
        )
          expressionArrows.pop();
      } else if (char === "}") {
        while (
          expressionArrows.length &&
          braceDepth <= expressionArrows.at(-1).braceDepth &&
          parenDepth <= expressionArrows.at(-1).parenDepth &&
          bracketDepth <= expressionArrows.at(-1).bracketDepth
        )
          expressionArrows.pop();
      }

      if (char === "{") {
        const isFn = isFunctionBraceBounded(view, cursor);
        stack.push(isFn);
        if (isFn) functionDepth++;
        braceDepth++;
      } else if (char === "}") {
        const wasFn = stack.pop();
        if (wasFn) functionDepth--;
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (char === "(") parenDepth++;
      else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (char === "[") bracketDepth++;
      else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      cursor++;
    }
    if (pendingArrow && target < view.length && !/\s/.test(view[target])) {
      if (view[target] !== "{") expressionArrows.push({ parenDepth, bracketDepth, braceDepth });
      pendingArrow = false;
    }
    result.set(target, Math.max(0, functionDepth + expressionArrows.length));
  }
  return result;
}

function scanEnvReferences(source, file, role) {
  const executable = executableSourceView(source, file);
  const view = codeView(executable);
  const matches = [];
  const hasCapacity = () => matches.length <= MAX_ENV_EVIDENCE_PER_FILE;
  const addMatch = (key, index, ignored = false) => {
    if (!ignored && hasCapacity()) matches.push({ key, index });
  };
  const scanDotAccess = (regex, syntax) => {
    if (!hasCapacity()) return;
    regex.lastIndex = 0;
    for (let match; (match = regex.exec(view)) !== null;) {
      addMatch(
        match[1],
        match.index,
        syntax === "import-meta" && IMPORT_META_BUILTIN_ENV_KEYS.has(match[1]),
      );
      if (!hasCapacity()) break;
    }
  };
  const scanBracketAccess = (regex, prefix, syntax) => {
    if (!hasCapacity()) return;
    regex.lastIndex = 0;
    for (let match; (match = regex.exec(executable)) !== null;) {
      if (view.slice(match.index, match.index + prefix.length) === prefix) {
        addMatch(
          match[1],
          match.index,
          syntax === "import-meta" && IMPORT_META_BUILTIN_ENV_KEYS.has(match[1]),
        );
      }
      if (!hasCapacity()) break;
    }
  };
  const addSvelteModule = (kind, visibility, index, clause = null) => {
    if (kind === "dynamic" || clause === null) {
      const key =
        visibility === "public"
          ? `PUBLIC_SVELTEKIT_${kind.toUpperCase()}`
          : `SVELTEKIT_${kind.toUpperCase()}_PRIVATE`;
      addMatch(key, index);
      return;
    }
    const binding = /(?:^|,)\s*(?:type\s+)?([A-Z][A-Z0-9_]*)(?=\s*(?:as|:|,|$))/g;
    for (let match; (match = binding.exec(clause)) !== null;) {
      addMatch(match[1], index + match.index);
      if (!hasCapacity()) break;
    }
  };
  const statementSurvived = (index, form) => {
    const prefix = view.slice(index, index + 6);
    return form === "import" ? prefix === "import" : /^(?:const|let|var)\b/.test(prefix);
  };
  const scanSvelteNamedModules = (regex, form) => {
    if (!hasCapacity()) return;
    regex.lastIndex = 0;
    for (let match; (match = regex.exec(executable)) !== null;) {
      if (!statementSurvived(match.index, form)) continue;
      const clauseOffset = match[0].indexOf(match[1]);
      const clauseView = view.slice(
        match.index + clauseOffset,
        match.index + clauseOffset + match[1].length,
      );
      addSvelteModule(match[3], match[4], match.index + clauseOffset, clauseView);
      if (!hasCapacity()) break;
    }
  };
  const scanSvelteNamespaceModules = (regex, form) => {
    if (!hasCapacity()) return;
    regex.lastIndex = 0;
    for (let match; (match = regex.exec(executable)) !== null;) {
      if (!statementSurvived(match.index, form)) continue;
      addSvelteModule(match[2], match[3], match.index);
      if (!hasCapacity()) break;
    }
  };

  scanDotAccess(DOT_ENV_RE, "process");
  scanBracketAccess(BRACKET_ENV_RE, "process.env", "process");
  scanDotAccess(DOT_IMPORT_META_ENV_RE, "import-meta");
  scanBracketAccess(BRACKET_IMPORT_META_ENV_RE, "import.meta.env", "import-meta");
  scanSvelteNamedModules(SVELTE_NAMED_ENV_IMPORT_RE, "import");
  scanSvelteNamespaceModules(SVELTE_NAMESPACE_ENV_IMPORT_RE, "import");
  scanSvelteNamedModules(SVELTE_NAMED_ENV_REQUIRE_RE, "require");
  scanSvelteNamespaceModules(SVELTE_NAMESPACE_ENV_REQUIRE_RE, "require");

  matches.sort((a, b) => a.index - b.index);
  const depths = functionDepthAt(
    view,
    matches.map((match) => match.index),
  );
  return {
    evidence: matches.slice(0, MAX_ENV_EVIDENCE_PER_FILE).map((match) => ({
      key: match.key,
      topLevel: depths.get(match.index) === 0,
      role,
      file,
    })),
    truncated: matches.length > MAX_ENV_EVIDENCE_PER_FILE,
  };
}

function fileRole(path) {
  if (
    /(?:^|\/)(?:app|src\/app)\/.*route\.(?:t|j)sx?$/i.test(path) ||
    /(?:^|\/)pages\/api\//i.test(path)
  )
    return "route";
  if (
    /(?:^|\/)(?:app|src\/app)\/(?:.*\/)?(?:page|layout|template|loading|error|not-found)\.(?:t|j)sx?$/i.test(
      path,
    )
  )
    return "render";
  if (/(?:^|\/)(?:src\/)?pages\/(?:index|[^/]+)\.(?:astro|vue|svelte|tsx?|jsx?)$/i.test(path))
    return "render";
  if (/(?:^|\/)middleware\.(?:t|j)sx?$/i.test(path)) return "render";
  return "component-lib";
}

function validateZipMetadata(zip) {
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`zip-entry-count>${MAX_ZIP_ENTRIES}`);
  let total = 0;
  for (const entry of entries) {
    if (
      !safeArchivePath(entry.name) ||
      (entry.unsafeOriginalName && !safeArchivePath(entry.unsafeOriginalName))
    )
      throw new Error("zip-unsafe-path");
    if (entry.dir) continue;
    const uncompressed = Number(entry._data?.uncompressedSize ?? 0);
    const compressed = Number(entry._data?.compressedSize ?? 0);
    if (!Number.isSafeInteger(uncompressed) || uncompressed < 0)
      throw new Error("zip-invalid-size");
    if (uncompressed > MAX_ZIP_FILE_BYTES) throw new Error(`zip-file-size>${MAX_ZIP_FILE_BYTES}`);
    total += uncompressed;
    if (total > MAX_ZIP_TOTAL_BYTES) throw new Error(`zip-total-size>${MAX_ZIP_TOTAL_BYTES}`);
    if (uncompressed > MiB && uncompressed / Math.max(1, compressed) > MAX_COMPRESSION_RATIO)
      throw new Error("zip-compression-ratio");
  }
}

function entrySignals(paths, framework) {
  const lower = new Set(paths.map((path) => path.toLowerCase()));
  const any = (regex) => paths.some((path) => regex.test(path));
  const staticIndex = paths.find((path) => /(?:^|\/)index\.html?$/i.test(path)) ?? null;
  let entries = [];
  let routes = [];
  if (framework === "next") {
    entries = paths.filter(
      (path) =>
        /(?:^|\/)(?:app|src\/app)\/(?:[^/]+\/)*(?:page|layout)\.(?:t|j)sx?$/i.test(path) ||
        /(?:^|\/)(?:pages|src\/pages)\/index\.(?:t|j)sx?$/i.test(path),
    );
    routes = paths.filter(
      (path) =>
        /(?:^|\/)(?:app|src\/app)\/.*\/(?:page|route)\.(?:t|j)sx?$/i.test(path) ||
        /(?:^|\/)(?:pages|src\/pages)\/.+\.(?:t|j)sx?$/i.test(path),
    );
  } else if (framework === "vite") {
    entries = [
      staticIndex,
      ...paths.filter((path) => /(?:^|\/)src\/(?:main|app)\.(?:t|j)sx?$/i.test(path)),
    ].filter(Boolean);
  } else if (framework === "remix") {
    entries = paths.filter((path) => /(?:^|\/)app\/root\.(?:t|j)sx?$/i.test(path));
    routes = paths.filter((path) => /(?:^|\/)app\/routes\/.+\.(?:t|j)sx?$/i.test(path));
  } else if (framework === "astro") {
    entries = paths.filter((path) => /(?:^|\/)src\/pages\/index\.astro$/i.test(path));
    routes = paths.filter((path) => /(?:^|\/)src\/pages\/.+\.astro$/i.test(path));
  } else if (framework === "sveltekit") {
    entries = paths.filter((path) =>
      /(?:^|\/)src\/routes\/(?:\+page|\+layout)\.svelte$/i.test(path),
    );
    routes = paths.filter((path) =>
      /(?:^|\/)src\/routes\/.+\+(?:page|server)\.(?:svelte|ts|js)$/i.test(path),
    );
  } else if (framework === "static-html") entries = staticIndex ? [staticIndex] : [];
  return {
    entries: [...new Set(entries)],
    routes: [...new Set(routes)],
    hasEntry: entries.length > 0,
    hasSourceComponent: any(/\.(?:tsx?|jsx?|vue|svelte|astro)$/i),
    lower,
  };
}

export async function analyzeZipBuffer(buffer, meta = {}) {
  const record = {
    id: meta.id ?? "unknown",
    title: meta.title ?? null,
    category: meta.category ?? null,
    galleryVisible: meta.galleryVisible ?? null,
    manifestPreviewFits: meta.manifestPreviewFits ?? null,
    fileCount: 0,
    totalBytes: 0,
    maxFileBytes: 0,
    fitsHostCaps: false,
    hasPackageJson: false,
    packageJsonOk: false,
    hasDevScript: false,
    devScript: null,
    framework: "unknown",
    projectShape: "unknown",
    entryFiles: [],
    routeFiles: [],
    isAppRouter: false,
    isPagesRouter: false,
    lockfile: "none",
    nextVersion: null,
    reactVersion: null,
    tailwindVersion: null,
    tailwindSignal: "unknown",
    tsVersion: null,
    packages: {},
    depCount: 0,
    crossFrameworkDeps: [],
    integrations: {},
    motionDeps: {},
    motionDomExplicit: false,
    lockstepPinRisk: [],
    envRefCount: 0,
    envUncovered: [],
    envUncoveredServer: [],
    envFilesShipped: [],
    envPlacement: "none",
    envPlacementDetail: [],
    issues: [],
  };
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ARCHIVE_BYTES) {
    record.issues.push("archive-too-large");
    return record;
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
    validateZipMetadata(zip);
  } catch (error) {
    record.issues.push(`zip-rejected:${String(error.message || error).slice(0, 120)}`);
    return record;
  }

  const rawNames = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const stripped = stripCommonRoot(rawNames);
  const kept = [];
  for (let index = 0; index < rawNames.length; index++) {
    const path = stripped[index].replace(/^\/+/, "");
    if (!BLOCKED_PREFIXES.some((prefix) => path.toLowerCase().startsWith(prefix)))
      kept.push({ path, original: rawNames[index] });
  }
  for (const item of kept) {
    const size = Number(zip.files[item.original]?._data?.uncompressedSize ?? 0);
    record.fileCount++;
    record.totalBytes += size;
    record.maxFileBytes = Math.max(record.maxFileBytes, size);
  }
  const paths = kept.map((item) => item.path);
  const hasPath = (regex) => paths.some((path) => regex.test(path));
  record.isAppRouter = hasPath(/(?:^|\/)(?:app|src\/app)\//i);
  record.isPagesRouter = hasPath(/(?:^|\/)(?:pages|src\/pages)\//i);
  if (hasPath(/(?:^|\/)pnpm-lock\.ya?ml$/i)) record.lockfile = "pnpm";
  else if (hasPath(/(?:^|\/)yarn\.lock$/i)) record.lockfile = "yarn";
  else if (hasPath(/(?:^|\/)package-lock\.json$/i)) record.lockfile = "npm";

  const packageItem = kept
    .filter((item) => /(?:^|\/)package\.json$/i.test(item.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  let deps = {};
  if (packageItem) {
    record.hasPackageJson = true;
    const size = Number(zip.files[packageItem.original]?._data?.uncompressedSize ?? 0);
    if (size > MAX_PACKAGE_BYTES) record.issues.push("package-json-too-large");
    else {
      try {
        const pkg = JSON.parse(await zip.files[packageItem.original].async("string"));
        if (!pkg || typeof pkg !== "object" || Array.isArray(pkg))
          throw new Error("root-invalid-shape");
        const dependencies = boundedStringMap(pkg.dependencies, "dependencies", record.issues);
        const devDependencies = boundedStringMap(
          pkg.devDependencies,
          "devDependencies",
          record.issues,
        );
        deps = { ...dependencies, ...devDependencies };
        if (Object.keys(deps).length > MAX_DEPENDENCIES) {
          record.issues.push("dependencies-invalid-count");
          deps = {};
        }
        record.packageJsonOk = !record.issues.some(
          (issue) => issue.startsWith("dependencies-invalid-") || issue.startsWith("package-json"),
        );
        const scripts = boundedStringMap(pkg.scripts, "scripts", record.issues);
        record.devScript = scripts.dev ?? null;
        record.hasDevScript =
          typeof record.devScript === "string" && record.devScript.trim().length > 0;
      } catch (error) {
        record.issues.push(
          `package-json-unparseable:${String(error.message || error).slice(0, 80)}`,
        );
      }
    }
  }
  record.packages = deps;
  record.depCount = Object.keys(deps).length;
  record.nextVersion = deps.next ?? null;
  record.reactVersion = deps.react ?? null;
  record.tailwindVersion = deps.tailwindcss ?? null;
  record.tsVersion = deps.typescript ?? null;
  const tailwindMajor = majorOf(record.tailwindVersion);
  record.tailwindSignal =
    deps["@tailwindcss/postcss"] || tailwindMajor === 4
      ? "v4"
      : tailwindMajor === 3
        ? "v3"
        : record.tailwindVersion
          ? `v${tailwindMajor ?? "?"}`
          : "none";

  for (const [name, version] of Object.entries(deps)) {
    const bucket = bucketForDep(name);
    if (bucket) (record.integrations[bucket] ||= []).push(name);
    if (CROSS_FRAMEWORK.some((pattern) => pattern.test(name))) record.crossFrameworkDeps.push(name);
    if (MOTION_LOCKSTEP.has(name)) record.motionDeps[name] = version;
  }
  record.motionDomExplicit = Boolean(record.motionDeps["motion-dom"]);
  if (!record.motionDomExplicit) {
    for (const parent of MOTION_PARENTS)
      if (isExactPin(record.motionDeps[parent]))
        record.lockstepPinRisk.push(`${parent}@${record.motionDeps[parent]}`);
  }

  const hasConfig = (name) => hasPath(new RegExp(`(?:^|/)${name}\\.(?:mjs|cjs|js|ts)$`, "i"));
  if (deps.next || hasConfig("next\\.config")) record.framework = "next";
  else if (Object.keys(deps).some((name) => /^@remix-run\//.test(name))) record.framework = "remix";
  else if (deps.astro || hasConfig("astro\\.config")) record.framework = "astro";
  else if (deps["@sveltejs/kit"] || hasConfig("svelte\\.config")) record.framework = "sveltekit";
  else if (deps.vite || hasConfig("vite\\.config")) record.framework = "vite";
  else if (hasPath(/(?:^|\/)index\.html?$/i)) record.framework = "static-html";

  const signals = entrySignals(paths, record.framework);
  record.entryFiles = signals.entries.slice(0, 25);
  record.routeFiles = signals.routes.slice(0, 100);
  if (signals.hasEntry && record.hasPackageJson) record.projectShape = "full-project";
  else if (signals.hasEntry && record.framework === "static-html")
    record.projectShape = "static-site";
  else if (signals.hasSourceComponent) record.projectShape = "component-demo";

  let scannedBytes = 0;
  const envEvidence = [];
  const perKey = new Map();
  const incompleteEnvScanReasons = new Set();
  for (const item of kept) {
    if (/(?:^|\/)\.env(?:\.|$)/i.test(item.path)) {
      record.envFilesShipped.push(item.path);
      continue;
    }
    if (!SOURCE_EXT.test(item.path) || item.path.toLowerCase().startsWith("components/ui/"))
      continue;
    const size = Number(zip.files[item.original]?._data?.uncompressedSize ?? 0);
    if (size > MAX_SOURCE_BYTES) {
      incompleteEnvScanReasons.add("file-size");
      continue;
    }
    if (scannedBytes + size > MAX_SOURCE_SCAN_TOTAL) {
      incompleteEnvScanReasons.add("total-bytes");
      continue;
    }
    if (envEvidence.length >= MAX_ENV_EVIDENCE) {
      incompleteEnvScanReasons.add("evidence-cap");
      continue;
    }
    scannedBytes += size;
    let source;
    try {
      source = await zip.files[item.original].async("string");
    } catch {
      continue;
    }
    if (
      !source.includes("process.env") &&
      !source.includes("import.meta.env") &&
      !source.includes("$env/")
    )
      continue;
    const scan = scanEnvReferences(source, item.path, fileRole(item.path));
    if (scan.truncated) incompleteEnvScanReasons.add("evidence-cap");
    for (const evidence of scan.evidence) {
      if (
        BUILTIN_ENV_KEYS.has(evidence.key) ||
        (perKey.get(evidence.key) ?? 0) >= MAX_ENV_EVIDENCE_PER_KEY
      )
        continue;
      envEvidence.push(evidence);
      perKey.set(evidence.key, (perKey.get(evidence.key) ?? 0) + 1);
      if (envEvidence.length >= MAX_ENV_EVIDENCE) break;
    }
  }
  if (incompleteEnvScanReasons.size) {
    const reasons = [...incompleteEnvScanReasons].sort().join(",");
    record.issues.push(`env-scan-incomplete(${reasons})`);
  }
  const envKeys = [...new Set(envEvidence.map((item) => item.key))];
  record.envRefCount = envKeys.length;
  record.envUncovered = envKeys.filter((key) => !COVERED_ENV.has(key)).sort();
  record.envUncoveredServer = record.envUncovered
    .filter(
      (key) =>
        !key.startsWith("NEXT_PUBLIC_") &&
        !key.startsWith("PUBLIC_") &&
        !key.startsWith("VITE_") &&
        !key.startsWith("ASTRO_PUBLIC_"),
    )
    .sort();
  const uncoveredServer = new Set(record.envUncoveredServer);
  record.envPlacementDetail = envEvidence.filter((item) => uncoveredServer.has(item.key));
  if (record.envPlacementDetail.some((item) => item.topLevel && item.role !== "route"))
    record.envPlacement = "crash-on-load";
  else if (record.envPlacementDetail.some((item) => item.topLevel && item.role === "route"))
    record.envPlacement = "crash-on-route";
  else if (record.envPlacementDetail.length) record.envPlacement = "lazy-only";

  const capReasons = [];
  if (record.fileCount > HOST_MAX_FILES) capReasons.push(`files>${HOST_MAX_FILES}`);
  if (record.maxFileBytes > HOST_MAX_FILE_BYTES) capReasons.push("file>2MiB");
  if (record.totalBytes > HOST_MAX_TOTAL_BYTES) capReasons.push("total>12MiB");
  record.fitsHostCaps = capReasons.length === 0;
  if (!signals.hasEntry) record.issues.push("missing-recognized-entry");
  if (record.hasPackageJson && !record.hasDevScript) record.issues.push("no-dev-script");
  if (!record.fitsHostCaps) record.issues.push(`exceeds-host-caps(${capReasons.join(",")})`);
  const nextMajor = majorOf(record.nextVersion),
    reactMajor = majorOf(record.reactVersion);
  if (nextMajor !== null && nextMajor !== BASELINE.next)
    record.issues.push(`next-major-drift(${nextMajor}!=${BASELINE.next})`);
  if (reactMajor !== null && reactMajor !== BASELINE.react)
    record.issues.push(`react-major-drift(${reactMajor}!=${BASELINE.react})`);
  if (record.tailwindSignal === "v3") record.issues.push("tailwind-v3-drift");
  if (record.crossFrameworkDeps.length)
    record.issues.push(`kitchen-sink(${record.crossFrameworkDeps.length})`);
  if (record.lockstepPinRisk.length)
    record.issues.push(`lockstep-pin-risk(${record.lockstepPinRisk.join(",")})`);
  const buckets = Object.keys(record.integrations);
  if (buckets.length) record.issues.push(`needs-backend(${buckets.join("/")})`);
  if (record.envUncoveredServer.length)
    record.issues.push(`env-missing-server(${record.envUncoveredServer.length})`);
  else if (record.envUncovered.length)
    record.issues.push(`env-missing-public(${record.envUncovered.length})`);
  return record;
}

async function mapLimited(items, concurrency, fn) {
  const output = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const current = index++;
        output[current] = await fn(items[current], current);
      }
    }),
  );
  return output;
}

async function hashFile(path) {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

export function isAllowedArchiveUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export const ARCHIVE_REDIRECT_POLICY = "error";

async function downloadCached(item, cacheDir, noCache) {
  if (!ID_RE.test(item.id ?? "")) throw new Error("invalid template id");
  if (!isAllowedArchiveUrl(item.archiveUrl))
    throw new Error("archive URL must be credential-free Vercel Blob HTTPS");
  const url = new URL(item.archiveUrl);
  const expectedSha = String(item.archiveSha256 ?? "").toLowerCase();
  if (!SHA_RE.test(expectedSha)) throw new Error("invalid archive sha256");
  const declared = Number(item.archiveSizeBytes);
  if (Number.isFinite(declared) && (declared < 0 || declared > MAX_ARCHIVE_BYTES))
    throw new Error("declared archive too large");
  const destination = join(cacheDir, `${expectedSha}.zip`);
  if (!noCache && existsSync(destination)) {
    const info = await stat(destination);
    if (info.size <= MAX_ARCHIVE_BYTES && (await hashFile(destination)) === expectedSha)
      return readFile(destination);
  }
  const response = await fetch(url, {
    redirect: ARCHIVE_REDIRECT_POLICY,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`fetch ${response.status}`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES)
    throw new Error("content-length too large");
  await mkdir(cacheDir, { recursive: true });
  const temporary = join(cacheDir, `.${expectedSha}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(temporary, "wx");
  const hash = createHash("sha256");
  let size = 0;
  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ARCHIVE_BYTES) throw new Error("download exceeded archive limit");
      hash.update(value);
      await handle.write(value);
    }
    await handle.close();
    if (Number.isFinite(declared) && declared !== size) throw new Error("archive size mismatch");
    if (hash.digest("hex") !== expectedSha) throw new Error("archive sha256 mismatch");
    if (!noCache) await rename(temporary, destination);
    const path = noCache ? temporary : destination;
    const buffer = await readFile(path);
    if (noCache) await unlink(path).catch(() => {});
    return buffer;
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function collectZips(directory) {
  const root = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".zip")) output.push(path);
    }
  }
  await walk(root);
  return output.sort();
}

async function loadCoveredEnvKeys() {
  const result = new Set(PROJECT_PREVIEW_ENV_KEYS);
  for (const path of [
    "config/ai_models/40-harmless-placeholders.env.txt",
    "config/ai_models/41-tier3-stub-placeholders.env.txt",
  ]) {
    try {
      for (const line of (await readFile(resolve(process.cwd(), path), "utf8")).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("="))
          result.add(trimmed.slice(0, trimmed.indexOf("=")).trim());
      }
    } catch {
      /* Audit remains useful outside the repo. */
    }
  }
  return result;
}

function failureRecord(id, error, prefix = "audit-error") {
  return {
    id,
    framework: "unknown",
    projectShape: "unknown",
    fileCount: 0,
    totalBytes: 0,
    maxFileBytes: 0,
    fitsHostCaps: false,
    packages: {},
    integrations: {},
    crossFrameworkDeps: [],
    entryFiles: [],
    routeFiles: [],
    issues: [`${prefix}:${String(error?.message || error).slice(0, 160)}`],
  };
}

export async function runAudit(args) {
  COVERED_ENV = await loadCoveredEnvKeys();
  if (args.dir) {
    const paths = (await collectZips(args.dir)).slice(0, args.limit);
    return mapLimited(paths, args.concurrency, async (path) => {
      const name = basename(path).replace(/\.zip$/i, "");
      try {
        const info = await stat(path);
        if (info.size > MAX_ARCHIVE_BYTES) throw new Error("archive too large");
        return await analyzeZipBuffer(await readFile(path), { id: name });
      } catch (error) {
        return failureRecord(name, error);
      }
    });
  }
  const base = resolve(process.cwd(), "src/lib/templates");
  const manifest = JSON.parse(await readFile(join(base, "template-blob-manifest.json"), "utf8"));
  const gallery = JSON.parse(await readFile(join(base, "templates.json"), "utf8"));
  const galleryIds = new Set(
    gallery
      .filter((row) => row.slug !== "categories" && row.id !== "categories")
      .map((row) => row.id),
  );
  const items = manifest.templates.slice(0, args.limit);
  return mapLimited(items, args.concurrency, async (item) => {
    try {
      const buffer = await downloadCached(item, args.cache, args.noCache);
      return await analyzeZipBuffer(buffer, {
        id: item.id,
        title: item.title,
        category: item.category,
        galleryVisible: galleryIds.has(item.id),
        manifestPreviewFits: item.previewFits ?? null,
      });
    } catch (error) {
      return failureRecord(item.id, error, "download-error");
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const records = await runAudit(args);
  await writeFile(resolve(process.cwd(), args.out), JSON.stringify(records, null, 2) + "\n");
  if (!args.quiet) {
    const counts = {};
    for (const record of records) counts[record.framework] = (counts[record.framework] ?? 0) + 1;
    console.log(`[audit] ${records.length} archive(s) -> ${args.out}`);
    for (const [framework, count] of Object.entries(counts).sort())
      console.log(`  ${framework}: ${count}`);
    const rejected = records.filter((record) =>
      record.issues.some(
        (issue) => issue.startsWith("audit-error:") || issue.startsWith("zip-rejected:"),
      ),
    ).length;
    console.log(`  statically rejected: ${rejected}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[audit] ${error.message}`);
    process.exitCode = 1;
  });
}
