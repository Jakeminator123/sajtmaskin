/**
 * Felmeddelandet som läggs sist i ett assistentsvar när strömmen bryts. Om
 * strömmen bröts inne i ett kodblock hamnar varningen i den oavslutade
 * kodsvansen, som chattens output-parser klipper bort ur svarsrutan. Parsern
 * lyfter därför ut den här exakta svansen innan kodsvansen klipps.
 */
const STREAM_WARNING_PREFIX = "Varning: ";
const STREAM_WARNING_SEPARATOR = `\n\n${STREAM_WARNING_PREFIX}`;

export function appendStreamWarning(content: string | null | undefined, message: string): string {
  // Always one line, so the parser can tell it apart from model text or code after a «Varning:».
  const line = message.replace(/\s+/g, " ").trim();
  return content?.trim()
    ? `${content}${STREAM_WARNING_SEPARATOR}${line}`
    : `${STREAM_WARNING_PREFIX}${line}`;
}

export function splitTrailingStreamWarning(raw: string): { body: string; warning: string | null } {
  const separatorAt = raw.lastIndexOf(STREAM_WARNING_SEPARATOR);
  const start = separatorAt >= 0 ? separatorAt : raw.startsWith(STREAM_WARNING_PREFIX) ? 0 : -1;
  if (start < 0) return { body: raw, warning: null };
  const warning = raw.slice(start).trim();
  if (warning.includes("\n")) return { body: raw, warning: null };
  return { body: raw.slice(0, start), warning };
}
