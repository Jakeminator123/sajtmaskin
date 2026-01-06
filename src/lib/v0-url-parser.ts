/**
 * V0 URL Parser
 * =============
 *
 * Utility for parsing v0.dev URLs, registry URLs, and extracting IDs.
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
 * 5. Registry URL (shadcn/custom registries):
 *    https://ui.shadcn.com/r/styles/new-york/button.json
 *    → Returns: { type: "registry", registryUrl: "...", componentName: "button" }
 *
 * USAGE:
 *
 * ```typescript
 * import { parseV0Url, isV0Url, isRegistryUrl, parseRegistryUrl } from './v0-url-parser';
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
 *
 * // Check if string is a registry URL
 * if (isRegistryUrl(userInput)) {
 *   const result = parseRegistryUrl(userInput);
 *   await initFromRegistry(result.registryUrl);
 * }
 * ```
 */

export type V0UrlType = "template" | "chat" | "block" | "registry" | "unknown";

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
// REGISTRY URL PARSING (shadcn blocks, custom registries)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Known registry domains that follow shadcn registry spec
 */
const REGISTRY_DOMAINS = ["ui.shadcn.com", "shadcn.com", "registry.shadcn.com"];

export interface RegistryParseResult {
  isRegistry: boolean;
  registryUrl: string;
  componentName: string | null;
  style: string | null; // e.g. "new-york", "default"
}

/**
 * Check if a URL is a registry URL (shadcn or custom registry)
 *
 * Registry URLs typically:
 * - End with .json
 * - Contain /r/ or /registry/ path
 * - Are from known registry domains
 */
export function isRegistryUrl(input: string): boolean {
  if (!input || typeof input !== "string") return false;

  const trimmed = input.trim().toLowerCase();

  // Check for known registry domains
  for (const domain of REGISTRY_DOMAINS) {
    if (trimmed.includes(domain)) {
      return true;
    }
  }

  // Check for registry path patterns
  if (
    (trimmed.includes("/r/") || trimmed.includes("/registry/")) &&
    trimmed.endsWith(".json")
  ) {
    return true;
  }

  return false;
}

/**
 * Parse a registry URL and extract component information
 *
 * Examples:
 * - https://ui.shadcn.com/r/styles/new-york/button.json
 *   → { componentName: "button", style: "new-york" }
 * - https://custom-registry.com/r/my-component.json
 *   → { componentName: "my-component", style: null }
 */
export function parseRegistryUrl(url: string): RegistryParseResult {
  const result: RegistryParseResult = {
    isRegistry: false,
    registryUrl: url,
    componentName: null,
    style: null,
  };

  if (!url || typeof url !== "string") {
    return result;
  }

  try {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const parsed = new URL(normalizedUrl);
    const pathname = parsed.pathname;

    // Check if this looks like a registry URL
    if (!isRegistryUrl(normalizedUrl)) {
      return result;
    }

    result.isRegistry = true;
    result.registryUrl = normalizedUrl;

    // Extract component name from pathname
    // Pattern: /r/styles/{style}/{component}.json or /r/{component}.json
    const jsonMatch = pathname.match(/\/([^/]+)\.json$/);
    if (jsonMatch) {
      result.componentName = jsonMatch[1];
    }

    // Extract style if present (e.g., /styles/new-york/)
    const styleMatch = pathname.match(/\/styles\/([^/]+)\//);
    if (styleMatch) {
      result.style = styleMatch[1];
    }

    return result;
  } catch {
    // If parsing fails, return minimal result
    result.isRegistry = isRegistryUrl(url);
    return result;
  }
}

/**
 * Convert a component name to a registry URL
 * Useful for quickly constructing registry URLs from component names
 */
export function buildRegistryUrl(
  componentName: string,
  options: {
    baseUrl?: string;
    style?: string;
  } = {}
): string {
  const { baseUrl = "https://ui.shadcn.com", style = "new-york" } = options;
  return `${baseUrl}/r/styles/${style}/${componentName}.json`;
}

/**
 * Check if input is a registry import command
 * Example: npx shadcn@latest add button
 */
export function isShadcnAddCommand(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase().trim();
  return lower.includes("shadcn") && lower.includes("add");
}

/**
 * Extract component name from shadcn add command
 */
export function extractComponentFromShadcnCommand(
  command: string
): string | null {
  if (!command) return null;

  // Match: npx shadcn@latest add <component>
  // or: npx shadcn add <component>
  const match = command.match(/shadcn(?:@[\w.]+)?\s+add\s+["']?(\w+)["']?/i);
  if (match) {
    return match[1];
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
// Registry URL:
//   parseRegistryUrl("https://ui.shadcn.com/r/styles/new-york/button.json")
//   → { isRegistry: true, componentName: "button", style: "new-york" }
//
// Build registry URL:
//   buildRegistryUrl("card")
//   → "https://ui.shadcn.com/r/styles/new-york/card.json"
//
// NPX command:
//   const cmd = 'npx shadcn@latest add "https://v0.app/chat/b/U7A9nVKHqlV?token=..."'
//   if (isNpxShadcnCommand(cmd)) {
//     const url = extractUrlFromNpxCommand(cmd);
//     const parsed = parseV0Url(url);
//     // Use parsed.id to load template
//   }
//
// Shadcn add command:
//   extractComponentFromShadcnCommand("npx shadcn@latest add button")
//   → "button"
//
