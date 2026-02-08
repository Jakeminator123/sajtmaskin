export type UnicodeNormalizationSummary = {
  changed: boolean;
  replacements: number;
};

const UNICODE_ESCAPE_PATTERN = /(^|[^\\])\\u([0-9a-fA-F]{4})/g;

function decodeUnicodeEscape(match: string, prefix: string, hex: string) {
  const code = Number.parseInt(hex, 16);
  if (!Number.isFinite(code)) return match;
  return `${prefix}${String.fromCharCode(code)}`;
}

export function normalizeUnicodeEscapes(input: string): {
  output: string;
  summary: UnicodeNormalizationSummary;
} {
  let replacements = 0;
  const output = input.replace(
    UNICODE_ESCAPE_PATTERN,
    (match, prefix, hex) => {
      replacements += 1;
      return decodeUnicodeEscape(match, prefix, hex);
    },
  );
  return {
    output,
    summary: {
      changed: replacements > 0,
      replacements,
    },
  };
}
