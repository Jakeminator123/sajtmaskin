import type { CodeFile } from "@/lib/gen/parser";

/**
 * BUG-SWARM B11 — strip secret VALUES from env files before a project is
 * uploaded to a PUBLIC, unauthenticated blob (the export route's
 * `put(..., { access: "public" })`).
 *
 * Primary vector is the canonical `env.example` (no leading dot,
 * `PROJECT_ENV_FILE_PATH`): it is injected into `versions.files_json` and in
 * F3 merges REAL user-panel values (`projectEnvVars`, e.g. STRIPE_SECRET_KEY)
 * via `buildProjectEnvFileContents`. A model-emitted `.env.local` can also
 * carry real keys. Without this, those land in a permanent public CDN zip.
 *
 * Keys, comments and structure are preserved so the export stays a usable env
 * template — only values are dropped. Owner-scoped downloads (`/download`,
 * `/api/download`) keep full content and must NOT use this; the shared
 * `buildExportableProject` is likewise untouched so verify / quality-gate /
 * repair lanes are unaffected.
 */

/** Env files that may carry secret values in a public export. Includes the
 * canonical project env doc `env.example` (PROJECT_ENV_FILE_PATH) and its
 * pre-rename legacy name `env.env` (older, un-regenerated version snapshots can
 * still carry it with merged F3 values), plus every `.env*` variant. We do NOT
 * exempt `*.example` — `env.example` is exactly the file that merges real F3
 * values. Being conservative is correct for a public, unauthenticated CDN blob.
 * Keep the no-dot names in sync with `project-env-file.ts`. */
function isEnvFile(path: string): boolean {
  const base = fileBasename(path);
  return (
    base === "env.example" || base === "env.env" || base === ".env" || base.startsWith(".env.")
  );
}

function fileBasename(path: string): string {
  return (path.split(/[/\\]/).pop() ?? path).toLowerCase();
}

const KEY_ASSIGN = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=)/;

/**
 * Keep `KEY=` (value dropped), comments and blank lines; DROP every other
 * non-empty line. Dropping continuation lines is what makes this safe against
 * multiline / backslash-wrapped / quoted-across-lines values — no value text,
 * single- or multi-line, can survive.
 */
function redactEnvValues(content: string): string {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const match = line.match(KEY_ASSIGN);
    if (match) {
      out.push(match[1]);
    }
    // else: continuation / value-only line → dropped so no value text leaks
  }
  return out.join("\n");
}

const NPM_AUTH_KEYS = new Set([
  "_auth",
  "_authtoken",
  "_password",
  "password",
  "username",
  "key",
  "cert",
]);

/** Mirror npm ini's quoted-string decoding without adding a runtime dependency. */
function decodeNpmQuotedString(value: string): string | null {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (!quoted) return null;
  let decoded: unknown = trimmed.startsWith("'") ? trimmed.slice(1, -1) : trimmed;
  try {
    decoded = JSON.parse(decoded as string);
  } catch {
    // ini keeps malformed JSON literal; it may still contain a plain URL.
  }
  return typeof decoded === "string" ? decoded : null;
}

/** npm ini unescapes only backslash, semicolon and hash in unquoted strings. */
function decodeNpmUnquotedString(value: string): { decoded: string; comment: number } {
  let decoded = "";
  let comment = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      const next = value[++index];
      decoded += "\\;#".includes(next) ? next : `\\${next}`;
    } else if (char === ";" || char === "#") {
      comment = index;
      break;
    } else decoded += char;
  }
  return { decoded: decoded.trim(), comment };
}

function redactNpmUrlCredentials(value: string): string {
  const quoted = decodeNpmQuotedString(value);
  const unquoted = quoted === null ? decodeNpmUnquotedString(value) : null;
  let url: URL;
  try {
    // Use the same normalization as URL consumers, including TAB/LF removal
    // and special-scheme backslashes. Regex over the source cannot model it.
    url = new URL(quoted ?? unquoted!.decoded);
  } catch {
    return value;
  }
  if (!url.username && !url.password) return value;
  url.username = "";
  url.password = "";
  const comment = unquoted?.comment ?? value.length;
  const source = value.slice(0, comment);
  // Inline comments require an unquoted INI value. Escape its comment markers
  // and backslashes; otherwise serialize quoted values as JSON like npm does.
  const sanitized =
    quoted !== null
      ? JSON.stringify(url.href)
      : url.href.replace(/\\/g, "\\\\").replace(/[;#]/g, "\\$&");
  return (
    source.slice(0, source.length - source.trimStart().length) +
    sanitized +
    source.slice(source.trimEnd().length) +
    value.slice(comment)
  );
}

/** npmrc is INI, not dotenv: keep registry/install configuration usable. */
function redactNpmrcValues(content: string): string {
  let secretQuote: string | undefined;
  let secretContinuation = false;
  return content.replace(/[^\r\n]+/g, (line) => {
    if (secretQuote || secretContinuation) {
      if (secretQuote && line.trimEnd().endsWith(secretQuote)) secretQuote = undefined;
      secretContinuation = line.trimEnd().endsWith("\\");
      return "";
    }
    if (/^\s*[#;]/.test(line)) return line;
    const assignment = /^(\s*)([^=]+?)(\s*=\s*)(.*)$/.exec(line);
    if (!assignment) return line;
    const [, leading, rawKey, equals, value] = assignment;
    const key = decodeNpmQuotedString(rawKey) ?? decodeNpmUnquotedString(rawKey).decoded;
    const setting = key
      .slice(key.lastIndexOf(":") + 1)
      .replace(/\[\]$/, "")
      .toLowerCase();
    if (NPM_AUTH_KEYS.has(setting)) {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith('"') || trimmed.startsWith("'")) &&
        (trimmed.length === 1 || !trimmed.endsWith(trimmed[0]))
      )
        secretQuote = trimmed[0];
      secretContinuation = trimmed.endsWith("\\");
      return `${leading}${rawKey}${equals}`;
    }
    // Registry/proxy URLs can carry credentials independently of auth keys.
    const sanitized = redactNpmUrlCredentials(value);
    return sanitized === value ? line : `${leading}${rawKey}${equals}${sanitized}`;
  });
}

/** Redact env/npm credentials for public export and the private sites backup. */
export function sanitizeEnvSecretsForPublicExport(files: CodeFile[]): CodeFile[] {
  return files.map((file) => {
    if (typeof file.path !== "string" || typeof file.content !== "string") return file;
    if (isEnvFile(file.path)) return { ...file, content: redactEnvValues(file.content) };
    if (fileBasename(file.path) === ".npmrc") {
      return { ...file, content: redactNpmrcValues(file.content) };
    }
    return file;
  });
}
