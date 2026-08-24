const REDACTED = "[REDACTED]";

const QUOTED_ASSIGNMENT_RE = /(["']?)([A-Za-z][A-Za-z0-9_-]*)\1(\s*[:=]\s*)(["'`])([^\r\n]*?)\4/g;
const UNQUOTED_ASSIGNMENT_RE =
  /(["']?)([A-Za-z][A-Za-z0-9_-]*)\1(\s*[:=]\s*)(\$\{[A-Z][A-Z0-9_]*\}|[^\s,"'`;/}{\]][^\s,;}{\]]*)/g;

const SENSITIVE_KEY_SUFFIXES = [
  "authorization",
  "proxy_authorization",
  "api_key",
  "apikey",
  "access_key",
  "access_key_id",
  "secret_access_key",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "auth_token",
  "authtoken",
  "token",
  "client_secret",
  "clientsecret",
  "service_role_key",
  "servicerolekey",
  "secret",
  "secret_key",
  "password",
  "passwd",
  "private_key",
  "privatekey",
  "encryption_key",
  "signing_key",
  "signing_secret",
  "cookie_secret",
  "session_secret",
  "database_url",
  "databaseurl",
  "postgres_url",
  "redis_url",
  "webhook_secret",
  "signature",
  "dsn",
] as const;

const PRIVATE_KEY_BLOCK_RE =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g;
const PGP_PRIVATE_KEY_BLOCK_RE =
  /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g;

const PROVIDER_TOKEN_PATTERNS: readonly RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
  /\bwhsec_[A-Za-z0-9]{12,}\b/g,
  /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{12,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

function isSensitiveAssignmentKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
  return SENSITIVE_KEY_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`_${suffix}`),
  );
}

function shouldKeepNamedValue(value: string): boolean {
  const normalized = value.replace(/^["'`]|["'`]$/g, "").trim();
  return (
    /^(?:process|import\.meta|Deno)\.env\b/.test(normalized) ||
    /^\$\{?[A-Z][A-Z0-9_]*\}?$/.test(normalized) ||
    /^(?:<[^>]+>|\[REDACTED\]|undefined|null)$/.test(normalized)
  );
}

function redactNamedSecrets(input: string): string {
  const quoted = input.replace(
    QUOTED_ASSIGNMENT_RE,
    (
      match,
      keyQuote: string,
      key: string,
      separator: string,
      valueQuote: string,
      value: string,
    ) => {
      if (
        !isSensitiveAssignmentKey(key) ||
        shouldKeepNamedValue(`${valueQuote}${value}${valueQuote}`)
      ) {
        return match;
      }
      return `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${REDACTED}${valueQuote}`;
    },
  );
  return quoted.replace(
    UNQUOTED_ASSIGNMENT_RE,
    (match, keyQuote: string, key: string, separator: string, value: string) => {
      if (!isSensitiveAssignmentKey(key) || shouldKeepNamedValue(value)) return match;
      return `${keyQuote}${key}${keyQuote}${separator}${REDACTED}`;
    },
  );
}

function redactUrlSecrets(input: string): string {
  return input
    .replace(
      /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/gi,
      (_match, scheme: string) => `${scheme}://${REDACTED}`,
    )
    .replace(
      /([?&](?:token|key|secret|password|passwd|signature|sig|credential|auth|access_token|api_key)=)[^&#\s"']+/gi,
      `$1${REDACTED}`,
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`);
}

export type ScrubbedOpenClawText = {
  text: string;
  redacted: boolean;
  truncated: boolean;
};

/** Deterministic last-mile redaction for all model-visible read-tool text. */
export function scrubOpenClawReadText(
  raw: unknown,
  options?: { maxChars?: number },
): ScrubbedOpenClawText {
  const source = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  let text = source.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  text = text.replace(PRIVATE_KEY_BLOCK_RE, "[REDACTED PRIVATE KEY]");
  text = text.replace(PGP_PRIVATE_KEY_BLOCK_RE, "[REDACTED PRIVATE KEY]");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, `Bearer ${REDACTED}`);
  text = redactNamedSecrets(text);
  text = redactUrlSecrets(text);
  for (const pattern of PROVIDER_TOKEN_PATTERNS) {
    text = text.replace(pattern, REDACTED);
  }

  const redacted = text !== source;
  const maxChars = Math.max(0, options?.maxChars ?? Number.POSITIVE_INFINITY);
  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars);
  return { text, redacted, truncated };
}
