const MAX_LOG_URL_CHARS = 160;

/** Describe a URL without credentials, query parameters, fragments or control characters. */
export function urlForLog(value: string | URL): string {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, MAX_LOG_URL_CHARS);
  } catch {
    return "[invalid-url]";
  }
}
