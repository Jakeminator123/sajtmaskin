import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Strips imports that cause preview errors in the v0 sandbox:
 *
 *  - `import ... from "next/og"` → commented out entirely
 *  - `import { ImageResponse } from "next/server"` → commented out
 *  - Mixed imports like `import { NextRequest, ImageResponse } from "next/server"`
 *    → keeps NextRequest, drops ImageResponse
 */

const NEXT_OG_RE = /^\s*import\s.*from\s+["']next\/og["']/;
const NEXT_SERVER_RE =
  /^(\s*import\s*\{)([^}]+)(\}\s*from\s+["']next\/server["'].*)$/;

const STRIP_SPECIFIERS = new Set(["ImageResponse"]);

export const nextOgStrip: SuspenseRule = {
  name: "next-og-strip",

  transform(line: string, _context: StreamContext): string {
    if (NEXT_OG_RE.test(line)) {
      return "// next/og not available in preview";
    }

    const serverMatch = line.match(NEXT_SERVER_RE);
    if (!serverMatch) return line;

    const [, prefix, rawNames, suffix] = serverMatch;
    const names = rawNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const kept = names.filter(
      (n) => !STRIP_SPECIFIERS.has(n.split(/\s+as\s+/)[0].trim()),
    );

    if (kept.length === names.length) return line;
    if (kept.length === 0) return "// ImageResponse not available in preview";

    return `${prefix} ${kept.join(", ")} ${suffix}`;
  },
};
