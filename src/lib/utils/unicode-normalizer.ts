export type UnicodeNormalizationSummary = {
  changed: boolean;
  replacements: number;
};

const UNICODE_ESCAPE_PATTERN = /\\u([0-9a-fA-F]{4})/g;

function decodeUnicodeEscape(match: string, hex: string) {
  const code = Number.parseInt(hex, 16);
  if (!Number.isFinite(code)) return match;
  return String.fromCharCode(code);
}

export function normalizeUnicodeEscapes(input: string): {
  output: string;
  summary: UnicodeNormalizationSummary;
} {
  let replacements = 0;
  const output = input.replace(UNICODE_ESCAPE_PATTERN, (match, hex, offset) => {
    const index = typeof offset === "number" ? offset : 0;
    if (index > 0 && input[index - 1] === "\\") {
      return match;
    }
    const decoded = decodeUnicodeEscape(match, hex);
    if (decoded !== match) {
      replacements += 1;
    }
    return decoded;
  });
  return {
    output,
    summary: {
      changed: replacements > 0,
      replacements,
    },
  };
}
