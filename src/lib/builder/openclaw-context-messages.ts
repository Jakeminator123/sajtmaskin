/**
 * Kontextrader till Sajtagenten (OpenClaw).
 *
 * Assistentens kodblock har inget informationsvärde här — den riktiga koden
 * hämtas via `resolveFileContext`, som läser versionens filer ur databasen.
 * Ett godtyckligt TSX-fragment tränger bara ut riktig historik ur
 * kontextbudgeten. Användarens egna kodblock är däremot innehåll användaren
 * aktivt valde att skicka in och behålls oförändrade.
 */

const CODE_BLOCK_RE = /```[^\n]*\n[\s\S]*?(?:```|$)/g;
const FILE_ATTRIBUTE_RE = /file="([^"]+)"/;
const MAX_MARKER_CHARS = 160;

export interface OpenClawContextMessageInput<TRole extends string = string> {
  role: TRole;
  content: unknown;
}

export interface OpenClawContextMessage<TRole extends string = string> {
  role: TRole;
  content: string;
}

function buildMarker(paths: string[], blockCount: number): string {
  if (paths.length === 0) {
    return `[genererade ${blockCount} kodblock]`;
  }

  const label = `${paths.length} ${paths.length === 1 ? "fil" : "filer"}`;
  const listed: string[] = [];
  let used = `[genererade ${label}: ]`.length;

  for (const path of paths) {
    if (used + path.length + 2 > MAX_MARKER_CHARS) break;
    listed.push(path);
    used += path.length + 2;
  }

  if (listed.length === 0) return `[genererade ${label}]`;
  const suffix = listed.length < paths.length ? ", …" : "";
  return `[genererade ${label}: ${listed.join(", ")}${suffix}]`;
}

/** Byter ut fenced kodblock mot en kort markör som säger vad de innehöll. */
export function compressAssistantCodeBlocks(content: string): string {
  const paths: string[] = [];
  let blockCount = 0;

  const stripped = content.replace(CODE_BLOCK_RE, (match) => {
    blockCount += 1;
    const path = FILE_ATTRIBUTE_RE.exec(match)?.[1];
    if (path) paths.push(path);
    return "";
  });

  if (blockCount === 0) return content;

  const prose = stripped.replace(/\n{3,}/g, "\n\n").trim();
  const marker = buildMarker(paths, blockCount);
  return prose ? `${prose}\n${marker}` : marker;
}

function toContextMessage<TRole extends string>(
  message: OpenClawContextMessageInput<TRole>,
  maxChars: number,
): OpenClawContextMessage<TRole> {
  if (typeof message.content !== "string") {
    return { role: message.role, content: "[structured]" };
  }

  const content =
    message.role === "assistant" ? compressAssistantCodeBlocks(message.content) : message.content;

  return { role: message.role, content: content.slice(0, maxChars) };
}

export function buildOpenClawContextMessages<TRole extends string>(
  messages: readonly OpenClawContextMessageInput<TRole>[],
  options: { recentCount: number; maxChars: number },
): OpenClawContextMessage<TRole>[] {
  return messages
    .slice(-options.recentCount)
    .map((message) => toContextMessage(message, options.maxChars));
}
