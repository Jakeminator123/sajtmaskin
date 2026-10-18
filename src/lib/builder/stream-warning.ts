/**
 * Felmeddelandet som läggs sist i ett assistentsvar när strömmen bryts. Om
 * strömmen bröts inne i ett kodblock hamnar varningen i den oavslutade
 * kodsvansen, som chattens output-parser klipper bort ur svarsrutan. Parsern
 * lyfter därför ut den här exakta svansen innan kodsvansen klipps.
 */
const STREAM_WARNING_PREFIX = "Varning: ";
const STREAM_WARNING_SEPARATOR = `\n\n${STREAM_WARNING_PREFIX}`;

export function appendStreamWarning(content: string | null | undefined, message: string): string {
  return content?.trim()
    ? `${content}${STREAM_WARNING_SEPARATOR}${message}`
    : `${STREAM_WARNING_PREFIX}${message}`;
}

export function splitTrailingStreamWarning(raw: string): { body: string; warning: string | null } {
  const start = raw.startsWith(STREAM_WARNING_PREFIX) ? 0 : raw.lastIndexOf(STREAM_WARNING_SEPARATOR);
  if (start < 0) return { body: raw, warning: null };
  const warning = raw.slice(start).trim();
  // A fence after the marker means the text is still code, not the appended warning.
  if (warning.includes("```")) return { body: raw, warning: null };
  return { body: raw.slice(0, start), warning };
}
