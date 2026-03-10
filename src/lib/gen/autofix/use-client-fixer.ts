const CLIENT_HOOKS = /\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|useTransition|useOptimistic)\b/;
const EVENT_HANDLERS = /\b(onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseEnter|onMouseLeave)\b/;
const BROWSER_APIS = /\b(window\.|document\.|localStorage|sessionStorage|navigator\.)\b/;

const USE_CLIENT_RE = /^["']use client["'];?\s*$/;

function isClientExtension(filename: string): boolean {
  return /\.(tsx|jsx)$/.test(filename);
}

function hasUseClientDirective(code: string): boolean {
  const lines = code.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    return USE_CLIENT_RE.test(trimmed);
  }
  return false;
}

function needsUseClient(code: string): boolean {
  return CLIENT_HOOKS.test(code) || EVENT_HANDLERS.test(code) || BROWSER_APIS.test(code);
}

export function fixUseClient(
  code: string,
  filename: string,
): { code: string; fixed: boolean } {
  if (!isClientExtension(filename)) {
    return { code, fixed: false };
  }

  if (hasUseClientDirective(code)) {
    return { code, fixed: false };
  }

  if (!needsUseClient(code)) {
    return { code, fixed: false };
  }

  return { code: `"use client";\n\n${code}`, fixed: true };
}
