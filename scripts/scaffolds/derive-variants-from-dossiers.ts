import fs from "node:fs";
import path from "node:path";

import { getScaffoldIds } from "../../src/lib/gen/scaffolds";
import { getTemplateLibraryEntries } from "../../src/lib/gen/template-library/catalog";
import type {
  TemplateLibraryEntry,
  TemplateLibrarySignals,
} from "../../src/lib/gen/template-library/types";
import type {
  FontPairing,
  ScaffoldVariant,
  ScaffoldVariantThemeTokens,
} from "../../src/lib/gen/scaffold-variants/types";
import type { ScaffoldId } from "../../src/lib/gen/scaffolds/types";

type VariantSelector = {
  useCaseTags?: string[];
  siteFormTags?: string[];
  technicalPatternTags?: string[];
  titleIncludes?: string[];
  descriptionIncludes?: string[];
  stackTags?: string[];
  signals?: Partial<TemplateLibrarySignals>;
};

type VariantBlueprint = {
  scaffoldId: ScaffoldId;
  id: string;
  label: string;
  description: string;
  referenceScaffoldIds?: ScaffoldId[];
  keywords: string[];
  fontPairings: FontPairing[];
  signatureMotif: string;
  colorMode: "light" | "dark" | "either";
  promptHints: string[];
  themeTokens: ScaffoldVariantThemeTokens;
  selectors?: VariantSelector;
  default?: boolean;
};

const OUTPUT_ROOT = path.join(process.cwd(), "config", "scaffold-variants");

const BLUEPRINTS: VariantBlueprint[] = [
  {
    scaffoldId: "landing-page",
    id: "warm-local",
    label: "Warm Local",
    description: "Service-first variant for local businesses, salons, clinics, cafés, and hospitality.",
    referenceScaffoldIds: ["content-site", "blog"],
    keywords: ["frisör", "salong", "spa", "restaurang", "café", "bakery", "kafé", "lokal", "community", "friendly"],
    fontPairings: [{ heading: "DM Serif Display", body: "DM Sans" }],
    signatureMotif: "warm tints, rounded surfaces, and softly layered cards",
    colorMode: "light",
    promptHints: [
      "Prioritize opening hours, location trust, and a strong local CTA such as booking or visit planning.",
      "Keep the emotional tone warm, welcoming, and clearly business-specific rather than startup-generic.",
    ],
    themeTokens: {
      background: "oklch(0.985 0.012 82)",
      foreground: "oklch(0.24 0.02 42)",
      card: "oklch(0.995 0.01 82)",
      primary: "oklch(0.66 0.16 52)",
      primaryForeground: "oklch(0.99 0 0)",
      secondary: "oklch(0.95 0.02 82)",
      muted: "oklch(0.94 0.01 72)",
      accent: "oklch(0.9 0.04 65)",
      border: "oklch(0.88 0.01 65)",
      ring: "oklch(0.66 0.16 52)",
      radius: "1.1rem",
      bodyBackgroundImage:
        "radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 10%, white) 0%, transparent 26%), linear-gradient(to bottom, color-mix(in oklab, var(--color-accent) 18%, white) 0%, transparent 24%)",
    },
    selectors: {
      titleIncludes: ["restaurant", "cafe", "bakery", "salon", "spa", "clinic", "hotel"],
      signals: { cms: true },
    },
  },
  {
    scaffoldId: "landing-page",
    id: "corporate-grid",
    label: "Corporate Grid",
    description: "Trust-heavy B2B and consulting landing pages with clean hierarchy.",
    referenceScaffoldIds: ["saas-landing", "content-site"],
    keywords: ["b2b", "consulting", "agency", "corporate", "enterprise", "trust", "professional", "byrå", "företag"],
    fontPairings: [{ heading: "Manrope", body: "Inter" }],
    signatureMotif: "precise grid alignment, neutral surfaces, and partner-proof rhythm",
    colorMode: "light",
    promptHints: [
      "Lead with business clarity, partner trust, and a measured hierarchy rather than expressive atmospherics.",
      "Prefer proof blocks, metrics, and cases over decorative cards.",
    ],
    themeTokens: {
      background: "oklch(0.99 0.002 255)",
      foreground: "oklch(0.23 0.01 255)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.56 0.14 250)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.004 255)",
      muted: "oklch(0.95 0.004 255)",
      accent: "oklch(0.92 0.015 240)",
      border: "oklch(0.89 0.004 255)",
      ring: "oklch(0.56 0.14 250)",
      radius: "0.95rem",
    },
    selectors: {
      useCaseTags: ["saas"],
      titleIncludes: ["enterprise", "corporate", "agency", "consulting", "b2b"],
    },
    default: true,
  },
  {
    scaffoldId: "landing-page",
    id: "bold-startup",
    label: "Bold Startup",
    description: "Launch-oriented landing pages with strong contrast, velocity, and product momentum.",
    referenceScaffoldIds: ["saas-landing", "content-site"],
    keywords: ["startup", "launch", "waitlist", "product", "growth", "momentum", "bold", "snabb", "scale"],
    fontPairings: [{ heading: "Space Grotesk", body: "Inter" }],
    signatureMotif: "high-contrast headlines, sharp gradients, and velocity-driven proof blocks",
    colorMode: "dark",
    promptHints: [
      "Favor momentum, value velocity, and conversion tension over soft hospitality aesthetics.",
      "Above the fold should feel product-led and energetic without collapsing into generic SaaS blue.",
    ],
    themeTokens: {
      background: "oklch(0.17 0.02 270)",
      foreground: "oklch(0.94 0.006 260)",
      card: "oklch(0.2 0.02 270)",
      primary: "oklch(0.72 0.22 310)",
      primaryForeground: "oklch(0.12 0.01 270)",
      secondary: "oklch(0.24 0.02 270)",
      muted: "oklch(0.23 0.015 270)",
      accent: "oklch(0.66 0.17 220)",
      border: "oklch(0.3 0.015 270)",
      ring: "oklch(0.72 0.22 310)",
      radius: "1rem",
      bodyBackgroundImage:
        "radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 18%, transparent) 0%, transparent 32%), radial-gradient(circle at bottom right, color-mix(in oklab, var(--color-accent) 14%, transparent) 0%, transparent 30%)",
    },
    selectors: {
      useCaseTags: ["saas"],
      titleIncludes: ["launch", "waitlist", "growth", "startup", "ai"],
      signals: { pricing: true },
    },
  },
  {
    scaffoldId: "landing-page",
    id: "editorial-lux",
    label: "Editorial Lux",
    description: "Premium, lifestyle, and fashion-led landing pages with editorial framing.",
    referenceScaffoldIds: ["portfolio", "content-site"],
    keywords: ["luxury", "premium", "fashion", "editorial", "exclusive", "elegant", "lyx", "mode"],
    fontPairings: [{ heading: "Cormorant Garamond", body: "Raleway" }],
    signatureMotif: "editorial framing, premium contrast, and restrained luxury accents",
    colorMode: "dark",
    promptHints: [
      "Use stronger storytelling and atmosphere than a normal brochure page.",
      "Treat whitespace and image framing as part of the premium experience.",
    ],
    themeTokens: {
      background: "oklch(0.15 0.01 35)",
      foreground: "oklch(0.93 0.01 80)",
      card: "oklch(0.18 0.01 35)",
      primary: "oklch(0.78 0.1 85)",
      primaryForeground: "oklch(0.12 0 0)",
      secondary: "oklch(0.24 0.01 35)",
      muted: "oklch(0.22 0.01 35)",
      accent: "oklch(0.55 0.06 40)",
      border: "oklch(0.3 0.01 45)",
      ring: "oklch(0.78 0.1 85)",
      radius: "1.2rem",
    },
    selectors: {
      titleIncludes: ["luxury", "fashion", "premium", "boutique", "editorial"],
      useCaseTags: ["portfolio"],
    },
  },
  {
    scaffoldId: "landing-page",
    id: "nature-flow",
    label: "Nature Flow",
    description: "Organic, eco, and wellness-led landing pages with softer motion and earthy palettes.",
    referenceScaffoldIds: ["content-site", "blog"],
    keywords: ["eco", "nature", "garden", "forest", "organic", "green", "hållbar", "natur", "wellness"],
    fontPairings: [{ heading: "Fraunces", body: "Nunito Sans" }],
    signatureMotif: "organic curves, earth gradients, and natural contrast in section flow",
    colorMode: "light",
    promptHints: [
      "Favor earth-tone contrast, flowing transitions, and softer section rhythm over hard grids.",
      "The page should feel ecological and grounded rather than tech-polished.",
    ],
    themeTokens: {
      background: "oklch(0.985 0.01 145)",
      foreground: "oklch(0.23 0.03 145)",
      card: "oklch(0.99 0.01 140)",
      primary: "oklch(0.56 0.12 145)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.94 0.015 125)",
      muted: "oklch(0.95 0.01 115)",
      accent: "oklch(0.78 0.08 95)",
      border: "oklch(0.89 0.01 125)",
      ring: "oklch(0.56 0.12 145)",
      radius: "1.15rem",
      bodyBackgroundImage:
        "linear-gradient(to bottom, color-mix(in oklab, var(--color-primary) 8%, white) 0%, transparent 28%), radial-gradient(circle at top right, color-mix(in oklab, var(--color-accent) 16%, white) 0%, transparent 22%)",
    },
    selectors: {
      titleIncludes: ["eco", "green", "garden", "forest", "nature", "organic"],
    },
  },
  {
    scaffoldId: "ecommerce",
    id: "boutique-warm",
    label: "Boutique Warm",
    description: "Smaller curated storefronts with lifestyle framing and richer product storytelling.",
    keywords: ["boutique", "handmade", "artisan", "shop", "store", "curated", "lokal butik", "present"],
    fontPairings: [{ heading: "DM Serif Display", body: "Inter" }],
    signatureMotif: "editorial storefront framing, warm surfaces, and tactile merchandising",
    colorMode: "light",
    promptHints: [
      "Lead with merchandising and product mood before dense catalog controls.",
      "Product storytelling should feel curated rather than catalog-first.",
    ],
    themeTokens: {
      background: "oklch(0.985 0.008 55)",
      foreground: "oklch(0.24 0.015 30)",
      card: "oklch(0.995 0.005 55)",
      primary: "oklch(0.62 0.16 40)",
      primaryForeground: "oklch(0.99 0 0)",
      secondary: "oklch(0.95 0.01 55)",
      muted: "oklch(0.95 0.005 35)",
      accent: "oklch(0.84 0.05 70)",
      border: "oklch(0.9 0.006 45)",
      ring: "oklch(0.62 0.16 40)",
      radius: "1rem",
    },
    selectors: {
      signals: { ecommerce: true },
      titleIncludes: ["shopify", "boutique", "fashion", "store"],
    },
  },
  {
    scaffoldId: "ecommerce",
    id: "streetwear-bold",
    label: "Streetwear Bold",
    description: "High-contrast storefronts with strong product attitude and campaign energy.",
    keywords: ["streetwear", "fashion", "sneakers", "bold", "urban", "drop", "limited", "skate"],
    fontPairings: [{ heading: "Bebas Neue", body: "Inter" }],
    signatureMotif: "hard contrast, oversized type, and campaign-led product storytelling",
    colorMode: "dark",
    promptHints: [
      "Favor campaign attitude and drop culture over safe retail neutrality.",
      "Product cards and promotional bands should feel fast, bold, and scarce.",
    ],
    themeTokens: {
      background: "oklch(0.13 0.01 260)",
      foreground: "oklch(0.95 0.006 260)",
      card: "oklch(0.18 0.01 260)",
      primary: "oklch(0.78 0.19 24)",
      primaryForeground: "oklch(0.12 0 0)",
      secondary: "oklch(0.22 0.01 260)",
      muted: "oklch(0.2 0.01 260)",
      accent: "oklch(0.67 0.2 140)",
      border: "oklch(0.3 0.01 260)",
      ring: "oklch(0.78 0.19 24)",
      radius: "0.8rem",
    },
    selectors: {
      signals: { ecommerce: true },
      titleIncludes: ["streetwear", "fashion", "store", "commerce"],
    },
  },
  {
    scaffoldId: "ecommerce",
    id: "megastore-clean",
    label: "Megastore Clean",
    description: "Catalog-heavy ecommerce variant with cleaner navigation and retail clarity.",
    keywords: ["catalog", "storefront", "ecommerce", "retail", "megastore", "clean", "marketplace", "katalog"],
    fontPairings: [{ heading: "Inter", body: "Inter" }],
    signatureMotif: "clean retail IA, strong faceting rhythm, and conversion-first clarity",
    colorMode: "light",
    promptHints: [
      "Optimize for product discovery, filtering, and cart clarity before decorative storytelling.",
      "Use a retailer mindset: navigation, categories, and trust must read instantly.",
    ],
    themeTokens: {
      background: "oklch(0.99 0.002 255)",
      foreground: "oklch(0.22 0.01 255)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.57 0.13 250)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.97 0.004 255)",
      muted: "oklch(0.95 0.004 255)",
      accent: "oklch(0.93 0.01 240)",
      border: "oklch(0.9 0.004 255)",
      ring: "oklch(0.57 0.13 250)",
      radius: "0.9rem",
    },
    selectors: {
      signals: { ecommerce: true },
      siteFormTags: ["storefront"],
    },
    default: true,
  },
  {
    scaffoldId: "dashboard",
    id: "glass-frosted",
    label: "Glass Frosted",
    description: "Modern SaaS analytics dashboard with frosted surfaces and layered depth.",
    keywords: ["analytics", "dashboard", "saas", "glass", "metrics", "workspace", "modern"],
    fontPairings: [{ heading: "Space Grotesk", body: "Inter" }],
    signatureMotif: "frosted panels, layered cards, and subtle glowing metrics",
    colorMode: "dark",
    promptHints: [
      "Keep information density high, but use translucent depth to separate zones cleanly.",
      "This should feel operational, polished, and product-grade rather than brochure-like.",
    ],
    themeTokens: {
      background: "oklch(0.16 0.015 250)",
      foreground: "oklch(0.94 0.006 250)",
      card: "oklch(0.21 0.015 250)",
      primary: "oklch(0.7 0.18 280)",
      primaryForeground: "oklch(0.12 0 0)",
      secondary: "oklch(0.24 0.015 250)",
      muted: "oklch(0.22 0.01 250)",
      accent: "oklch(0.62 0.14 220)",
      border: "oklch(0.3 0.01 250)",
      ring: "oklch(0.7 0.18 280)",
      radius: "1rem",
    },
    selectors: {
      signals: { dashboard: true },
      titleIncludes: ["dashboard", "analytics", "monitoring", "admin"],
    },
    default: true,
  },
  {
    scaffoldId: "dashboard",
    id: "dense-terminal",
    label: "Dense Terminal",
    description: "Developer-facing dashboard variant with terminal mood and dense operational UI.",
    keywords: ["terminal", "developer", "devtools", "cli", "infra", "monitoring", "ops", "observability"],
    fontPairings: [{ heading: "JetBrains Mono", body: "IBM Plex Sans" }],
    signatureMotif: "terminal chrome, dense panels, monospace hierarchy, and precise contrast",
    colorMode: "dark",
    promptHints: [
      "Favor dense but legible information panels, tabs, and code-like framing over marketing-style spacing.",
      "Use developer-friendly cues such as monospace, logs, traces, and command affordances where relevant.",
    ],
    themeTokens: {
      background: "oklch(0.12 0.01 265)",
      foreground: "oklch(0.93 0.005 265)",
      card: "oklch(0.16 0.01 265)",
      primary: "oklch(0.67 0.17 160)",
      primaryForeground: "oklch(0.1 0 0)",
      secondary: "oklch(0.19 0.01 265)",
      muted: "oklch(0.17 0.008 265)",
      accent: "oklch(0.76 0.1 85)",
      border: "oklch(0.28 0.01 265)",
      ring: "oklch(0.67 0.17 160)",
      radius: "0.75rem",
    },
    selectors: {
      signals: { dashboard: true, ai: true },
      technicalPatternTags: ["developer-tool", "realtime"],
      titleIncludes: ["chatbot", "agent", "developer", "observability", "devtools"],
    },
  },
  {
    scaffoldId: "app-shell",
    id: "immersive-dark",
    label: "Immersive Dark",
    description: "Product workspace variant for gaming, AI, creator tools, and intense app moods.",
    keywords: ["poker", "gaming", "creator", "immersive", "dark", "ai", "lobby", "workspace", "live"],
    fontPairings: [{ heading: "Sora", body: "Inter" }],
    signatureMotif: "immersive dark shell, glowing action states, and dramatic workspace framing",
    colorMode: "dark",
    promptHints: [
      "Treat the shell as a product world, not just a sidebar plus content column.",
      "Use contrast and atmosphere to make the workspace feel owned by a specific domain.",
    ],
    themeTokens: {
      background: "oklch(0.11 0.01 270)",
      foreground: "oklch(0.95 0.006 270)",
      card: "oklch(0.16 0.015 270)",
      primary: "oklch(0.72 0.2 330)",
      primaryForeground: "oklch(0.12 0 0)",
      secondary: "oklch(0.2 0.015 270)",
      muted: "oklch(0.18 0.01 270)",
      accent: "oklch(0.62 0.16 220)",
      border: "oklch(0.28 0.01 270)",
      ring: "oklch(0.72 0.2 330)",
      radius: "0.95rem",
    },
    selectors: {
      signals: { ai: true, dashboard: true },
      titleIncludes: ["chatbot", "gaming", "poker", "agent", "workspace"],
    },
  },
  {
    scaffoldId: "app-shell",
    id: "clean-utility",
    label: "Clean Utility",
    description: "Neutral, practical product shell for CRMs, tools, admin surfaces, and operations apps.",
    keywords: ["admin", "crm", "workspace", "utility", "clean", "operations", "tool", "portal", "service"],
    fontPairings: [{ heading: "Inter", body: "Inter" }],
    signatureMotif: "clean utility shell, structured spacing, and practical interface contrast",
    colorMode: "either",
    promptHints: [
      "Prioritize clarity, hierarchy, and task flow before visual expressiveness.",
      "The app shell should feel extensible and neutral enough for many product domains.",
    ],
    themeTokens: {
      background: "oklch(0.98 0.003 255)",
      foreground: "oklch(0.22 0.01 255)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.54 0.14 250)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.004 255)",
      muted: "oklch(0.95 0.004 255)",
      accent: "oklch(0.93 0.01 240)",
      border: "oklch(0.89 0.004 255)",
      ring: "oklch(0.54 0.14 250)",
      radius: "0.85rem",
    },
    selectors: {
      signals: { dashboard: true },
      titleIncludes: ["crm", "admin", "workspace", "portal", "dashboard"],
    },
    default: true,
  },
  {
    scaffoldId: "blog",
    id: "editorial-serif",
    label: "Editorial Serif",
    description: "Reading-led blog variant with stronger typography and editorial hierarchy.",
    keywords: ["editorial", "essay", "reading", "magazine", "content", "blog", "serif", "longform"],
    fontPairings: [{ heading: "Playfair Display", body: "Source Sans 3" }],
    signatureMotif: "editorial type hierarchy, generous reading rhythm, and calm framing",
    colorMode: "light",
    promptHints: [
      "Make reading comfort and article hierarchy more important than card-heavy grids.",
      "Use typography and spacing to create authority before adding decorative layout moves.",
    ],
    themeTokens: {
      background: "oklch(0.985 0.004 85)",
      foreground: "oklch(0.2 0.015 45)",
      card: "oklch(0.995 0.003 85)",
      primary: "oklch(0.48 0.1 35)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.005 75)",
      muted: "oklch(0.95 0.004 65)",
      accent: "oklch(0.9 0.02 60)",
      border: "oklch(0.88 0.004 65)",
      ring: "oklch(0.48 0.1 35)",
      radius: "0.85rem",
    },
    selectors: {
      signals: { blog: true, cms: true },
      siteFormTags: ["editorial-site"],
    },
    default: true,
  },
  {
    scaffoldId: "blog",
    id: "tech-minimal",
    label: "Tech Minimal",
    description: "Developer blog variant with cleaner, faster, docs-adjacent presentation.",
    keywords: ["developer", "technical", "markdown", "contentlayer", "minimal", "docs", "api", "engineering"],
    fontPairings: [{ heading: "IBM Plex Sans", body: "IBM Plex Mono" }],
    signatureMotif: "clean technical hierarchy, docs-adjacent rhythm, and restrained developer polish",
    colorMode: "either",
    promptHints: [
      "Keep the reading flow technical and efficient rather than lifestyle-editorial.",
      "Use code-friendly surfaces and documentation-adjacent hierarchy where it helps.",
    ],
    themeTokens: {
      background: "oklch(0.97 0.003 240)",
      foreground: "oklch(0.2 0.01 240)",
      card: "oklch(0.99 0.003 240)",
      primary: "oklch(0.52 0.14 245)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.95 0.004 240)",
      muted: "oklch(0.94 0.004 240)",
      accent: "oklch(0.9 0.014 230)",
      border: "oklch(0.88 0.004 240)",
      ring: "oklch(0.52 0.14 245)",
      radius: "0.7rem",
    },
    selectors: {
      signals: { blog: true },
      titleIncludes: ["contentlayer", "markdown", "technical", "developer", "nextjs"],
      technicalPatternTags: ["content", "markdown"],
    },
  },
  {
    scaffoldId: "saas-landing",
    id: "dev-terminal",
    label: "Dev Terminal",
    description: "Developer-facing SaaS variant with API-first framing and technical product proof.",
    keywords: ["api", "developer", "terminal", "cli", "devtools", "sdk", "platform", "open-source"],
    fontPairings: [{ heading: "JetBrains Mono", body: "Space Grotesk" }],
    signatureMotif: "terminal previews, code framing, and dense technical product proof",
    colorMode: "dark",
    promptHints: [
      "Market the product through developer trust, API clarity, and technical proof instead of broad lifestyle benefits.",
      "Treat code examples and product surface previews as first-class design elements.",
    ],
    themeTokens: {
      background: "oklch(0.12 0.01 265)",
      foreground: "oklch(0.95 0.006 265)",
      card: "oklch(0.17 0.01 265)",
      primary: "oklch(0.68 0.18 160)",
      primaryForeground: "oklch(0.1 0 0)",
      secondary: "oklch(0.2 0.01 265)",
      muted: "oklch(0.18 0.008 265)",
      accent: "oklch(0.72 0.1 85)",
      border: "oklch(0.28 0.01 265)",
      ring: "oklch(0.68 0.18 160)",
      radius: "0.85rem",
    },
    selectors: {
      signals: { pricing: true, ai: true },
      titleIncludes: ["api", "gateway", "sdk", "developer", "chatbot"],
    },
  },
  {
    scaffoldId: "saas-landing",
    id: "friendly-saas",
    label: "Friendly SaaS",
    description: "Approachable SaaS marketing variant with softer product framing and growth clarity.",
    keywords: ["saas", "product", "pricing", "subscription", "friendly", "growth", "workflow", "team"],
    fontPairings: [{ heading: "Sora", body: "Nunito Sans" }],
    signatureMotif: "friendly product framing, rounded proof blocks, and accessible SaaS clarity",
    colorMode: "light",
    promptHints: [
      "Balance product proof with approachable copy and visual warmth.",
      "Pricing and product trust should be clear without becoming enterprise-stiff.",
    ],
    themeTokens: {
      background: "oklch(0.99 0.004 250)",
      foreground: "oklch(0.22 0.01 250)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.62 0.17 265)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.01 250)",
      muted: "oklch(0.95 0.008 250)",
      accent: "oklch(0.88 0.05 180)",
      border: "oklch(0.9 0.006 250)",
      ring: "oklch(0.62 0.17 265)",
      radius: "1rem",
    },
    selectors: {
      useCaseTags: ["saas"],
      signals: { pricing: true },
    },
    default: true,
  },
  {
    scaffoldId: "portfolio",
    id: "showcase-bold",
    label: "Showcase Bold",
    description: "Image-forward portfolio variant with stronger attitude and project contrast.",
    keywords: ["portfolio", "showcase", "creative", "photography", "visual", "gallery", "bold", "work"],
    fontPairings: [{ heading: "Bricolage Grotesque", body: "DM Sans" }],
    signatureMotif: "image-led project framing, strong contrast, and curated metadata overlays",
    colorMode: "dark",
    promptHints: [
      "Lead with project imagery and work identity before biography copy.",
      "Every project block should feel curated and memorable, not like a feature card.",
    ],
    themeTokens: {
      background: "oklch(0.14 0.01 275)",
      foreground: "oklch(0.95 0.006 275)",
      card: "oklch(0.18 0.01 275)",
      primary: "oklch(0.74 0.16 18)",
      primaryForeground: "oklch(0.1 0 0)",
      secondary: "oklch(0.21 0.01 275)",
      muted: "oklch(0.19 0.008 275)",
      accent: "oklch(0.7 0.12 155)",
      border: "oklch(0.3 0.01 275)",
      ring: "oklch(0.74 0.16 18)",
      radius: "0.95rem",
    },
    selectors: {
      signals: { portfolio: true },
      titleIncludes: ["portfolio", "showcase", "creative", "photography"],
    },
  },
  {
    scaffoldId: "portfolio",
    id: "minimal-studio",
    label: "Minimal Studio",
    description: "Cleaner studio portfolio for architects, consultants, and restrained creative practices.",
    keywords: ["studio", "minimal", "architect", "consultant", "clean", "portfolio", "designer", "artist"],
    fontPairings: [{ heading: "Instrument Sans", body: "Inter" }],
    signatureMotif: "quiet studio minimalism, generous spacing, and refined project metadata",
    colorMode: "light",
    promptHints: [
      "Prefer fewer, stronger layout moves with plenty of calm space around projects.",
      "This should feel like a curated studio presence, not a loud campaign site.",
    ],
    themeTokens: {
      background: "oklch(0.99 0.002 260)",
      foreground: "oklch(0.2 0.01 260)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.48 0.08 260)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.003 260)",
      muted: "oklch(0.95 0.003 260)",
      accent: "oklch(0.9 0.01 250)",
      border: "oklch(0.89 0.003 260)",
      ring: "oklch(0.48 0.08 260)",
      radius: "0.8rem",
    },
    selectors: {
      signals: { portfolio: true },
      titleIncludes: ["portfolio", "studio", "minimal"],
    },
    default: true,
  },
  {
    scaffoldId: "auth-pages",
    id: "clean-auth",
    label: "Clean Auth",
    description: "Clear, trust-heavy authentication surface with practical emphasis on form states and flows.",
    keywords: ["login", "auth", "signup", "security", "clean", "credential", "password", "konto"],
    fontPairings: [{ heading: "Inter", body: "Inter" }],
    signatureMotif: "clear auth framing, trust cues, and practical form polish",
    colorMode: "either",
    promptHints: [
      "Keep helper text, validation feedback, and next-step clarity visible and trustworthy.",
      "The auth surface should feel product-ready rather than just a floating card demo.",
    ],
    themeTokens: {
      background: "oklch(0.97 0.003 250)",
      foreground: "oklch(0.2 0.01 250)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.55 0.13 250)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.95 0.004 250)",
      muted: "oklch(0.94 0.004 250)",
      accent: "oklch(0.91 0.01 240)",
      border: "oklch(0.88 0.004 250)",
      ring: "oklch(0.55 0.13 250)",
      radius: "0.9rem",
    },
    selectors: {
      signals: { auth: true },
      siteFormTags: ["auth-flow"],
    },
    default: true,
  },
  {
    scaffoldId: "content-site",
    id: "warm-editorial",
    label: "Warm Editorial",
    description: "Broader content-first variant for publishing, CMS-led sites, and service storytelling.",
    keywords: ["content", "story", "editorial", "cms", "warm", "publishing", "magazine", "community"],
    fontPairings: [{ heading: "Merriweather", body: "DM Sans" }],
    signatureMotif: "content-first rhythm, warm editorial hierarchy, and calm section flow",
    colorMode: "light",
    promptHints: [
      "Organize the experience around storytelling and reading cadence rather than conversion-only stacking.",
      "Favor rich content hierarchy, callouts, and believable editorial structure.",
    ],
    themeTokens: {
      background: "oklch(0.985 0.004 80)",
      foreground: "oklch(0.22 0.015 40)",
      card: "oklch(0.995 0.003 80)",
      primary: "oklch(0.58 0.11 45)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.96 0.004 75)",
      muted: "oklch(0.95 0.004 65)",
      accent: "oklch(0.88 0.03 65)",
      border: "oklch(0.89 0.004 65)",
      ring: "oklch(0.58 0.11 45)",
      radius: "1rem",
    },
    selectors: {
      signals: { cms: true, blog: true },
      siteFormTags: ["editorial-site"],
    },
    default: true,
  },
  {
    scaffoldId: "base-nextjs",
    id: "starter-neutral",
    label: "Starter Neutral",
    description: "Minimal neutral variant for generic starter builds and broad extension work.",
    keywords: ["starter", "minimal", "neutral", "clean", "nextjs", "baseline", "grundmall"],
    fontPairings: [{ heading: "Geist", body: "Geist" }],
    signatureMotif: "quiet starter baseline, restrained tokens, and safe extension-first clarity",
    colorMode: "either",
    promptHints: [
      "Stay intentionally minimal and extension-friendly when the prompt is underspecified.",
      "Do not pretend to be a finished marketing or product site unless the prompt clearly demands it.",
    ],
    themeTokens: {
      background: "oklch(0.15 0.004 0)",
      foreground: "oklch(0.95 0.004 0)",
      card: "oklch(0.18 0.004 0)",
      cardForeground: "oklch(0.95 0.004 0)",
      primary: "oklch(0.58 0.16 258)",
      primaryForeground: "oklch(0.98 0 0)",
      secondary: "oklch(0.22 0.004 0)",
      secondaryForeground: "oklch(0.9 0.004 0)",
      muted: "oklch(0.22 0.004 0)",
      mutedForeground: "oklch(0.6 0.004 0)",
      accent: "oklch(0.25 0.004 0)",
      accentForeground: "oklch(0.9 0.004 0)",
      border: "oklch(0.28 0.004 0)",
      ring: "oklch(0.58 0.16 258)",
      radius: "0.625rem",
    },
    selectors: {
      titleIncludes: ["starter", "boilerplate", "baseline", "playground"],
    },
    default: true,
  },
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function limit(values: string[], max: number): string[] {
  return unique(values).slice(0, max);
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function matchesAny(text: string, values: string[] | undefined): boolean {
  if (!values || values.length === 0) return false;
  const lower = normalize(text);
  return values.some((value) => lower.includes(normalize(value)));
}

function scoreEntry(entry: TemplateLibraryEntry, blueprint: VariantBlueprint): number {
  const allowedScaffoldIds = new Set([
    blueprint.scaffoldId,
    ...(blueprint.referenceScaffoldIds ?? []),
  ]);
  if (!entry.recommendedScaffoldIds.some((id) => allowedScaffoldIds.has(id))) return -1;

  const selectors = blueprint.selectors;
  let score = 10;
  const title = `${entry.title} ${entry.description} ${entry.summary}`;
  const stack = entry.stackTags.join(" ");

  if (selectors?.useCaseTags?.length) {
    score += selectors.useCaseTags.filter((tag) =>
      entry.classification.useCaseTags.includes(tag),
    ).length * 3;
  }
  if (selectors?.siteFormTags?.length) {
    score += selectors.siteFormTags.filter((tag) =>
      entry.classification.siteFormTags.includes(tag),
    ).length * 3;
  }
  if (selectors?.technicalPatternTags?.length) {
    score += selectors.technicalPatternTags.filter((tag) =>
      entry.classification.technicalPatternTags.includes(tag),
    ).length * 2;
  }
  if (matchesAny(title, selectors?.titleIncludes)) score += 4;
  if (matchesAny(entry.description, selectors?.descriptionIncludes)) score += 2;
  if (matchesAny(stack, selectors?.stackTags)) score += 2;

  if (selectors?.signals) {
    for (const [key, expected] of Object.entries(selectors.signals)) {
      if (entry.signals[key as keyof TemplateLibrarySignals] === expected) {
        score += 2;
      }
    }
  }

  score += Math.min(6, entry.qualityScore / 20);
  return score;
}

function aggregateGuidance(
  entries: TemplateLibraryEntry[],
): Pick<
  ScaffoldVariant,
  "styleRules" | "sectionInventory" | "avoidPatterns" | "worldClassRubric" | "sourceTemplateIds"
> {
  return {
    styleRules: limit(entries.flatMap((entry) => entry.runtimeGuidance?.styleRules ?? []), 4),
    sectionInventory: limit(
      entries.flatMap((entry) => entry.runtimeGuidance?.sectionInventory ?? []),
      5,
    ),
    avoidPatterns: limit(
      entries.flatMap((entry) => entry.runtimeGuidance?.avoidPatterns ?? []),
      4,
    ),
    worldClassRubric: limit(
      entries.flatMap((entry) => entry.runtimeGuidance?.worldClassRubric ?? []),
      5,
    ),
    sourceTemplateIds: entries.slice(0, 4).map((entry) => entry.id),
  };
}

function buildVariantFromBlueprint(
  blueprint: VariantBlueprint,
  entries: TemplateLibraryEntry[],
): ScaffoldVariant {
  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, blueprint) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || b.entry.qualityScore - a.entry.qualityScore)
    .slice(0, 4)
    .map((entry) => entry.entry);

  const guidance = aggregateGuidance(ranked);
  return {
    id: blueprint.id,
    scaffoldId: blueprint.scaffoldId,
    label: blueprint.label,
    description: blueprint.description,
    keywords: blueprint.keywords,
    fontPairings: blueprint.fontPairings,
    signatureMotif: blueprint.signatureMotif,
    colorMode: blueprint.colorMode,
    promptHints: blueprint.promptHints,
    themeTokens: blueprint.themeTokens,
    styleRules: guidance.styleRules,
    sectionInventory: guidance.sectionInventory,
    avoidPatterns: guidance.avoidPatterns,
    worldClassRubric: guidance.worldClassRubric,
    sourceTemplateIds: guidance.sourceTemplateIds,
    default: blueprint.default ?? false,
  };
}

function writeVariant(variant: ScaffoldVariant, dryRun: boolean): void {
  const targetDir = path.join(OUTPUT_ROOT, variant.scaffoldId);
  const targetFile = path.join(targetDir, `${variant.id}.json`);
  const body = `${JSON.stringify(variant, null, 2)}\n`;
  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, body, "utf8");
  }
  console.info(
    `[scaffold-variants] ${dryRun ? "Would write" : "Wrote"} ${path.relative(process.cwd(), targetFile)} ` +
      `(sources: ${(variant.sourceTemplateIds ?? []).join(", ") || "none"})`,
  );
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const entries = getTemplateLibraryEntries();
  const knownScaffoldIds = new Set(getScaffoldIds());
  const invalidBlueprint = BLUEPRINTS.find((blueprint) => !knownScaffoldIds.has(blueprint.scaffoldId));
  if (invalidBlueprint) {
    throw new Error(`Unknown scaffoldId in blueprint: ${invalidBlueprint.scaffoldId}`);
  }

  for (const blueprint of BLUEPRINTS) {
    for (const refId of blueprint.referenceScaffoldIds ?? []) {
      if (!knownScaffoldIds.has(refId)) {
        console.warn(
          `[scaffold-variants] Blueprint ${blueprint.id} references removed scaffold ${refId} in referenceScaffoldIds — ignoring stale reference.`,
        );
      }
    }
    const variant = buildVariantFromBlueprint(blueprint, entries);
    writeVariant(variant, dryRun);
  }

  console.info(
    `[scaffold-variants] ${dryRun ? "Previewed" : "Generated"} ${BLUEPRINTS.length} variants under ${path.relative(process.cwd(), OUTPUT_ROOT)}`,
  );
}

main();
