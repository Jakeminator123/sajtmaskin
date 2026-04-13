const LUCIDE_IMPORT_RE =
  /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["'];?/g;

const REPLACEMENTS: Record<string, string> = {
  Instagram: "Camera",
  TikTok: "Music",
  Snapchat: "Ghost",
  WhatsApp: "MessageCircle",
  Telegram: "Send",
  Discord: "MessageSquare",
  Slack: "Hash",
  Spotify: "Music",
  Pinterest: "Pin",
  Reddit: "MessagesSquare",
  Dribbble: "Circle",
  Figma: "PenTool",
};

const UNAVAILABLE_SET = new Set(Object.keys(REPLACEMENTS));

export function fixUnavailableLucideIcons(
  code: string,
): { code: string; fixed: boolean } {
  let result = code;
  let fixed = false;

  result = result.replace(LUCIDE_IMPORT_RE, (match, imports: string) => {
    const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
    let changed = false;
    const newParts = parts.map((name) => {
      const replacement = REPLACEMENTS[name];
      if (replacement && !parts.includes(replacement)) {
        changed = true;
        return replacement;
      }
      if (UNAVAILABLE_SET.has(name)) {
        changed = true;
        return REPLACEMENTS[name] ?? name;
      }
      return name;
    });

    if (!changed) return match;
    fixed = true;
    const dedupedParts = [...new Set(newParts)];
    return `import { ${dedupedParts.join(", ")} } from "lucide-react"`;
  });

  if (fixed) {
    for (const [bad, good] of Object.entries(REPLACEMENTS)) {
      const usageRe = new RegExp(`<${bad}\\b`, "g");
      result = result.replace(usageRe, `<${good}`);
      const closingRe = new RegExp(`</${bad}>`, "g");
      result = result.replace(closingRe, `</${good}>`);
    }
  }

  return { code: result, fixed };
}
