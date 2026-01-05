/**
 * V0 URL Parser
 * =============
 *
 * Utility for parsing v0.dev URLs and extracting IDs.
 *
 * SUPPORTED URL FORMATS:
 *
 * 1. Template URL:
 *    https://v0.app/templates/nano-banana-pro-playground-hkRpZoLOrJC
 *    → Returns: { type: "template", id: "nano-banana-pro-playground-hkRpZoLOrJC" }
 *
 * 2. Chat URL:
 *    https://v0.app/chat/nano-banana-pro-playground-yPexP3Vk3vD
 *    → Returns: { type: "chat", id: "nano-banana-pro-playground-yPexP3Vk3vD" }
 *
 * 3. Block/Component URL (for npx shadcn):
 *    https://v0.app/chat/b/U7A9nVKHqlV?token=eyJhbGci...
 *    → Returns: { type: "block", id: "U7A9nVKHqlV", token: "eyJhbGci..." }
 *
 * 4. V0.dev URL (alternative domain):
 *    https://v0.dev/t/templateId
 *    → Returns: { type: "template", id: "templateId" }
 *
 * USAGE:
 *
 * ```typescript
 * import { parseV0Url, isV0Url } from './v0-url-parser';
 *
 * // Check if string is a v0 URL
 * if (isV0Url(userInput)) {
 *   const result = parseV0Url(userInput);
 *   if (result.type === 'template') {
 *     await generateFromTemplate(result.id);
 *   } else if (result.type === 'chat') {
 *     // Continue existing chat
 *   }
 * }
 * ```
 */

export type V0UrlType = "template" | "chat" | "block" | "unknown";

export interface V0ParseResult {
  type: V0UrlType;
  id: string | null;
  token?: string;
  originalUrl: string;
}

/**
 * Check if a string is a v0 URL
 */
export function isV0Url(input: string): boolean {
  if (!input || typeof input !== "string") return false;

  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.includes("v0.app") ||
    trimmed.includes("v0.dev") ||
    trimmed.includes("vercel.app/chat") // Some v0 deployments
  );
}

/**
 * Parse a v0 URL and extract the ID and type
 */
export function parseV0Url(url: string): V0ParseResult {
  const result: V0ParseResult = {
    type: "unknown",
    id: null,
    originalUrl: url,
  };

  if (!url || typeof url !== "string") {
    return result;
  }

  try {
    // Normalize URL
    let normalizedUrl = url.trim();

    // Add protocol if missing
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const parsed = new URL(normalizedUrl);
    const pathname = parsed.pathname;

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern: /templates/{templateId}
    // Example: https://v0.app/templates/nano-banana-pro-playground-hkRpZoLOrJC
    // ═══════════════════════════════════════════════════════════════════════
    const templateMatch = pathname.match(/\/templates?\/([^/]+)/);
    if (templateMatch) {
      result.type = "template";
      result.id = templateMatch[1];
      return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern: /t/{templateId} (v0.dev shorthand)
    // Example: https://v0.dev/t/templateId
    // ═══════════════════════════════════════════════════════════════════════
    const shortTemplateMatch = pathname.match(/\/t\/([^/]+)/);
    if (shortTemplateMatch) {
      result.type = "template";
      result.id = shortTemplateMatch[1];
      return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern: /chat/b/{blockId} (Block/Component export)
    // Example: https://v0.app/chat/b/U7A9nVKHqlV?token=...
    // ═══════════════════════════════════════════════════════════════════════
    const blockMatch = pathname.match(/\/chat\/b\/([^/]+)/);
    if (blockMatch) {
      result.type = "block";
      result.id = blockMatch[1];
      result.token = parsed.searchParams.get("token") || undefined;
      return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern: /chat/{chatId} (Chat/Conversation)
    // Example: https://v0.app/chat/nano-banana-pro-playground-yPexP3Vk3vD
    // ═══════════════════════════════════════════════════════════════════════
    const chatMatch = pathname.match(/\/chat\/([^/]+)/);
    if (chatMatch) {
      result.type = "chat";
      result.id = chatMatch[1];
      return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern: Just an ID (bare ID without path)
    // Example: nano-banana-pro-playground-hkRpZoLOrJC
    // ═══════════════════════════════════════════════════════════════════════
    // If the URL doesn't match any pattern but has a path that looks like an ID
    if (pathname.length > 1) {
      const possibleId = pathname.replace(/^\//, "").split("/")[0];
      if (possibleId && possibleId.length > 5 && !possibleId.includes(".")) {
        // Assume it's a template ID
        result.type = "template";
        result.id = possibleId;
        return result;
      }
    }
  } catch {
    // If URL parsing fails, try to extract ID directly
    const idMatch = url.match(/([a-zA-Z0-9_-]{6,})/);
    if (idMatch) {
      result.type = "template";
      result.id = idMatch[1];
    }
  }

  return result;
}

/**
 * Extract template ID from any v0 URL or bare ID
 * Returns null if not a valid template source
 */
export function extractTemplateId(input: string): string | null {
  if (!input) return null;

  // If it's a URL, parse it
  if (isV0Url(input)) {
    const parsed = parseV0Url(input);
    if (parsed.type === "template" || parsed.type === "chat") {
      return parsed.id;
    }
    return null;
  }

  // If it looks like a bare ID (alphanumeric with dashes)
  const bareIdMatch = input.match(/^[a-zA-Z0-9_-]{6,}$/);
  if (bareIdMatch) {
    return input;
  }

  return null;
}

/**
 * Generate v0 URLs from an ID
 */
export function generateV0Urls(id: string): {
  templateUrl: string;
  chatUrl: string;
  ogImageUrl: string;
} {
  return {
    templateUrl: `https://v0.app/templates/${id}`,
    chatUrl: `https://v0.app/chat/${id}`,
    ogImageUrl: `https://v0.dev/api/og?path=/t/${id}`,
  };
}

/**
 * Check if input is an npx shadcn command
 * Example: npx shadcn@latest add "https://v0.app/chat/b/U7A9nVKHqlV?token=..."
 */
export function isNpxShadcnCommand(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase().trim();
  return lower.includes("npx") && lower.includes("shadcn");
}

/**
 * Extract v0 URL from npx shadcn command
 */
export function extractUrlFromNpxCommand(command: string): string | null {
  if (!command) return null;

  // Match URL in quotes or after "add"
  const urlMatch = command.match(/["']?(https?:\/\/[^\s"']+)["']?/);

  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLES FOR DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════
//
// Template URL:
//   parseV0Url("https://v0.app/templates/nano-banana-pro-playground-hkRpZoLOrJC")
//   → { type: "template", id: "nano-banana-pro-playground-hkRpZoLOrJC" }
//
// Chat URL:
//   parseV0Url("https://v0.app/chat/yPexP3Vk3vD")
//   → { type: "chat", id: "yPexP3Vk3vD" }
//
// Block URL with token:
//   parseV0Url("https://v0.app/chat/b/U7A9nVKHqlV?token=eyJhbGci...")
//   → { type: "block", id: "U7A9nVKHqlV", token: "eyJhbGci..." }
//
// NPX command:
//   const cmd = 'npx shadcn@latest add "https://v0.app/chat/b/U7A9nVKHqlV?token=..."'
//   if (isNpxShadcnCommand(cmd)) {
//     const url = extractUrlFromNpxCommand(cmd);
//     const parsed = parseV0Url(url);
//     // Use parsed.id to load template
//   }
//
