/**
 * Content Extractor
 * =================
 *
 * Analyzes generated React/Next.js code to extract editable content.
 * Creates a content manifest that maps content IDs to their values and types.
 *
 * Supports:
 * - Text content (headings, paragraphs, buttons, links)
 * - Images (src attributes)
 * - Colors (from Tailwind classes and inline styles)
 * - Products/items (if detected)
 */

export interface ContentItem {
  id: string;
  type: "text" | "image" | "color" | "link" | "product";
  value: string;
  context: string; // Where in the page (hero, footer, etc.)
  selector?: string; // CSS-like selector for the element
  originalLine?: number;
}

export interface ProductItem {
  id: string;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  category?: string;
}

export interface ColorTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ContentManifest {
  version: string;
  siteType: "landing-page" | "website" | "dashboard" | "unknown";
  extractedAt: string;
  content: ContentItem[];
  products: ProductItem[];
  colors: ColorTheme;
  metadata: {
    title?: string;
    description?: string;
    hasContactForm: boolean;
    hasNewsletter: boolean;
    hasProducts: boolean;
    pageCount: number;
  };
}

// Section detection patterns
const SECTION_PATTERNS = {
  hero: /hero|banner|jumbotron|splash/i,
  header: /header|nav|navigation|topbar/i,
  footer: /footer|bottom/i,
  about: /about|om\s*oss/i,
  contact: /contact|kontakt/i,
  pricing: /pricing|pris|plans/i,
  features: /features|funktioner|services/i,
  testimonials: /testimonials|reviews|omdömen/i,
  products: /products|produkter|shop|butik/i,
  team: /team|personal|medarbetare/i,
  gallery: /gallery|galleri|portfolio/i,
  faq: /faq|frågor/i,
  cta: /cta|call.?to.?action/i,
};

/**
 * Extract context (section name) from surrounding code
 */
function detectContext(code: string, position: number): string {
  // Look backwards for section indicators
  const lookbackRange = code.substring(Math.max(0, position - 500), position);

  for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(lookbackRange)) {
      return section;
    }
  }

  return "general";
}

/**
 * Generate a unique, readable content ID
 */
function generateContentId(type: string, context: string, index: number): string {
  return `${context}-${type}-${index}`.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Extract all text content from code
 */
function extractTextContent(code: string): ContentItem[] {
  const items: ContentItem[] = [];
  const seen = new Set<string>();
  let index = 0;

  // Extract JSX text content
  let match;
  const jsxPattern = /<(h[1-6]|p|span|button|a|label|li|td|th|dt|dd)[^>]*>([^<]{3,})<\//g;

  while ((match = jsxPattern.exec(code)) !== null) {
    const text = match[2].trim();

    // Skip if too short, looks like code, or already seen
    if (text.length < 3 || text.includes("{") || seen.has(text)) continue;

    seen.add(text);
    const context = detectContext(code, match.index);

    items.push({
      id: generateContentId("text", context, index++),
      type: "text",
      value: text,
      context,
      originalLine: code.substring(0, match.index).split("\n").length,
    });
  }

  // Extract string literals (titles, descriptions, etc.)
  const literalPattern =
    /(?:title|label|heading|description|placeholder|alt)\s*[:=]\s*["']([^"']{3,})["']/gi;

  while ((match = literalPattern.exec(code)) !== null) {
    const text = match[1].trim();

    if (text.length < 3 || seen.has(text)) continue;

    seen.add(text);
    const context = detectContext(code, match.index);

    items.push({
      id: generateContentId("text", context, index++),
      type: "text",
      value: text,
      context,
      originalLine: code.substring(0, match.index).split("\n").length,
    });
  }

  return items;
}

/**
 * Extract image sources from code
 */
function extractImages(code: string): ContentItem[] {
  const items: ContentItem[] = [];
  const seen = new Set<string>();
  let index = 0;

  const patterns = [
    /src\s*=\s*["']([^"']+\.(jpg|jpeg|png|gif|webp|svg)[^"']*)["']/gi,
    /(?:image|img|photo|picture|background)\s*[:=]\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const src = match[1].trim();

      // Skip data URIs, already seen, or internal Next.js paths
      if (src.startsWith("data:") || seen.has(src) || src.includes("/_next/")) continue;

      seen.add(src);
      const context = detectContext(code, match.index);

      items.push({
        id: generateContentId("image", context, index++),
        type: "image",
        value: src,
        context,
        originalLine: code.substring(0, match.index).split("\n").length,
      });
    }
  }

  return items;
}

/**
 * Extract color theme from Tailwind classes and inline styles
 */
function extractColors(code: string): ColorTheme {
  const colors: ColorTheme = {
    primary: "#3b82f6", // Default blue
    secondary: "#6b7280", // Default gray
    accent: "#10b981", // Default emerald
    background: "#ffffff", // Default white
    text: "#1f2937", // Default gray-800
  };

  // Common Tailwind color mappings
  const tailwindColors: Record<string, Record<string, string>> = {
    blue: { "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8" },
    teal: { "500": "#14b8a6", "600": "#0d9488" },
    emerald: { "500": "#10b981", "600": "#059669" },
    purple: { "500": "#8b5cf6", "600": "#7c3aed" },
    pink: { "500": "#ec4899", "600": "#db2777" },
    red: { "500": "#ef4444", "600": "#dc2626" },
    orange: { "500": "#f97316", "600": "#ea580c" },
    yellow: { "500": "#eab308", "600": "#ca8a04" },
    green: { "500": "#22c55e", "600": "#16a34a" },
    gray: {
      "50": "#f9fafb",
      "100": "#f3f4f6",
      "800": "#1f2937",
      "900": "#111827",
    },
    slate: {
      "50": "#f8fafc",
      "100": "#f1f5f9",
      "800": "#1e293b",
      "900": "#0f172a",
    },
  };

  // Find primary color (most used bg- color in buttons/CTAs)
  const bgMatches = code.matchAll(/bg-(\w+)-(\d+)/g);
  const colorCounts: Record<string, number> = {};

  for (const match of bgMatches) {
    const [, color, shade] = match;
    if (color !== "white" && color !== "black" && color !== "gray" && color !== "slate") {
      const key = `${color}-${shade}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
  }

  // Get most used color as primary
  const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  if (sortedColors.length > 0) {
    const [topColor] = sortedColors[0][0].split("-");
    if (tailwindColors[topColor]) {
      colors.primary = tailwindColors[topColor]["500"] || colors.primary;
    }
  }

  // Extract hex colors directly used
  const hexMatches = code.matchAll(/#([0-9a-fA-F]{6})/g);
  const hexColors = [...hexMatches].map((m) => `#${m[1]}`);

  if (hexColors.length > 0) {
    colors.primary = hexColors[0];
    if (hexColors.length > 1) colors.secondary = hexColors[1];
    if (hexColors.length > 2) colors.accent = hexColors[2];
  }

  return colors;
}

/**
 * Detect if code contains product-like structures
 */
function extractProducts(code: string): ProductItem[] {
  const products: ProductItem[] = [];

  // Look for arrays of objects with product-like properties
  const productArrayMatch = code.match(
    /(?:products|items|menu|cards|menuItems)\s*[:=]\s*\[([\s\S]*?)\]/i,
  );

  if (!productArrayMatch) return products;

  // Try to parse individual product objects
  const objectPattern = /\{\s*(?:name|title)\s*:\s*["']([^"']+)["'][^}]*\}/g;
  let match;
  let index = 0;

  while ((match = objectPattern.exec(productArrayMatch[1])) !== null) {
    const fullMatch = match[0];

    const product: ProductItem = {
      id: `product-${index++}`,
      name: match[1],
    };

    // Extract description
    const descMatch = fullMatch.match(/description\s*:\s*["']([^"']+)["']/);
    if (descMatch) product.description = descMatch[1];

    // Extract price
    const priceMatch = fullMatch.match(/price\s*:\s*["']?([^"',}]+)["']?/);
    if (priceMatch) product.price = priceMatch[1].trim();

    // Extract image
    const imageMatch = fullMatch.match(/(?:image|img|photo)\s*:\s*["']([^"']+)["']/);
    if (imageMatch) product.image = imageMatch[1];

    // Extract category
    const catMatch = fullMatch.match(/category\s*:\s*["']([^"']+)["']/);
    if (catMatch) product.category = catMatch[1];

    products.push(product);
  }

  return products;
}

/**
 * Detect site type from code content
 */
function detectSiteType(code: string): ContentManifest["siteType"] {
  const lower = code.toLowerCase();

  // Dashboard indicators
  if (
    lower.includes("sidebar") &&
    (lower.includes("chart") || lower.includes("stats") || lower.includes("analytics"))
  ) {
    return "dashboard";
  }

  // Multi-page website indicators
  if (
    (lower.includes("/about") || lower.includes("/contact") || lower.includes("/services")) &&
    (lower.includes("navigation") || lower.includes("navbar"))
  ) {
    return "website";
  }

  // Landing page (default for single-page sites)
  if (
    lower.includes("hero") &&
    (lower.includes("cta") || lower.includes("call to action") || lower.includes("signup"))
  ) {
    return "landing-page";
  }

  return "unknown";
}

/**
 * Main extraction function - analyzes code and returns content manifest
 */
export function extractContent(
  code: string,
  files?: { name: string; content: string }[],
): ContentManifest {
  // Combine all file contents if multiple files provided
  const fullCode = files ? files.map((f) => f.content).join("\n\n") : code;

  const textContent = extractTextContent(fullCode);
  const imageContent = extractImages(fullCode);
  const products = extractProducts(fullCode);
  const colors = extractColors(fullCode);
  const siteType = detectSiteType(fullCode);

  // Detect metadata
  const hasContactForm = /contact.*form|form.*contact|kontakt.*formulär/i.test(fullCode);
  const hasNewsletter = /newsletter|nyhetsbrev|subscribe|prenumerera/i.test(fullCode);
  const hasProducts = products.length > 0 || /product|produkt|shop|butik|pris/i.test(fullCode);

  // Try to extract title
  const titleMatch = fullCode.match(/(?:<title>|title\s*[:=]\s*["'])([^<"']+)/i);
  const descMatch = fullCode.match(/(?:description\s*[:=]\s*["'])([^"']+)/i);

  return {
    version: "1.0.0",
    siteType,
    extractedAt: new Date().toISOString(),
    content: [...textContent, ...imageContent],
    products,
    colors,
    metadata: {
      title: titleMatch?.[1],
      description: descMatch?.[1],
      hasContactForm,
      hasNewsletter,
      hasProducts,
      pageCount: files?.length || 1,
    },
  };
}

/**
 * Validate and sanitize content manifest
 */
export function validateManifest(manifest: ContentManifest): boolean {
  if (!manifest.version || !manifest.siteType || !manifest.content) {
    return false;
  }

  // Ensure all content items have required fields
  for (const item of manifest.content) {
    if (!item.id || !item.type || item.value === undefined) {
      return false;
    }
  }

  return true;
}
