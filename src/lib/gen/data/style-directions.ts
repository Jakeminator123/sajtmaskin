import type { ScaffoldId } from "../scaffolds/types";

export type FontPairing = { heading: string; body: string };

type StyleDirectionPreset = {
  id: string;
  layoutApproach: string;
  sectionRhythm: string;
  signatureMotif: string;
  fontMood: string;
  fontPairings: FontPairing[];
  sectionRecipes: string[];
  families?: ScaffoldId[];
  keywords?: string[];
};

export type StyleDirection = {
  id: string;
  layoutApproach: string;
  sectionRhythm: string;
  signatureMotif: string;
  fontMood: string;
  fontPairings: FontPairing[];
  sectionRecipes: string[];
};

export interface StyleDirectionInput {
  prompt: string;
  scaffoldId?: ScaffoldId | null;
  styleKeywords?: string[];
  generationMode?: "init" | "followUp";
  /** Optional per-session seed (e.g. chatId, timestamp) to vary output for identical prompts. */
  sessionSeed?: string;
}

const STYLE_DIRECTION_PRESETS: StyleDirectionPreset[] = [
  {
    id: "editorial_split",
    layoutApproach: "asymmetric split hero with overlapping media frames",
    sectionRhythm: "spacious intro -> dense proof band -> spacious CTA",
    signatureMotif: "editorial rules, framed callouts, and subtle grain",
    fontMood: "display serif headings with clean neutral sans body",
    fontPairings: [
      { heading: "Playfair Display", body: "Source Sans 3" },
      { heading: "Lora", body: "Inter" },
    ],
    sectionRecipes: [
      "Split hero with AspectRatio image + overlapping Card callout",
      "Testimonial rail using Carousel + HoverCard author reveals",
      "Stat band with animated counters and Badge highlights",
      "Content sections using Tabs for topic switching",
    ],
    families: ["content-site", "blog"],
    keywords: ["editorial", "story", "magazine", "content", "artikel", "berättelse", "tidning", "nyheter", "news"],
  },
  {
    id: "glass_dashboard",
    layoutApproach: "modular dashboard shell with pinned side navigation",
    sectionRhythm: "compact control panels -> medium data blocks -> compact utility rows",
    signatureMotif: "frosted cards, thin borders, and depth layers",
    fontMood: "geometric sans with high-contrast numeric accents",
    fontPairings: [
      { heading: "Space Grotesk", body: "Inter" },
      { heading: "JetBrains Mono", body: "Inter" },
    ],
    sectionRecipes: [
      "Sidebar + NavigationMenu shell with Sheet for mobile nav",
      "Data overview using Table + Pagination + Skeleton loading states",
      "Metric cards with Chart + Progress indicators",
      "Settings panel using Tabs + Form + Switch toggles",
    ],
    families: ["dashboard", "app-shell"],
    keywords: ["dashboard", "analytics", "admin", "control", "workspace", "panel", "statistik", "översikt"],
  },
  {
    id: "commerce_showcase",
    layoutApproach: "visual-first storefront with staggered product modules",
    sectionRhythm: "immersive hero -> dense catalog -> focused trust strip",
    signatureMotif: "product spotlight gradients and tactile cards",
    fontMood: "bold grotesk headings with readable commerce-friendly body text",
    fontPairings: [
      { heading: "Plus Jakarta Sans", body: "Inter" },
      { heading: "Outfit", body: "DM Sans" },
    ],
    sectionRecipes: [
      "Product spotlight hero with Carousel + AspectRatio",
      "Feature bento grid using Card + HoverCard detail reveals",
      "Trust strip with Table for comparison + Badge for ratings",
      "CTA section with Dialog for quick-buy flow",
    ],
    families: ["ecommerce"],
    keywords: ["shop", "store", "product", "checkout", "ecommerce", "butik", "köp", "handla", "webbshop", "varukorg", "webshop"],
  },
  {
    id: "saas_precision",
    layoutApproach: "structured SaaS narrative with alternating split sections and metric-driven hero",
    sectionRhythm: "tight value statement -> medium feature matrix -> tight conversion close",
    signatureMotif: "signal lines, controlled glow accents, metric chips, and trust badges",
    fontMood: "technical sans stack with subtle display emphasis",
    fontPairings: [
      { heading: "Space Grotesk", body: "Inter" },
      { heading: "Manrope", body: "Inter" },
    ],
    sectionRecipes: [
      "Value-prop hero with Badge social proof + animated metrics + partner logos",
      "Feature matrix using Tabs + Card grid with Tooltip details",
      "Pricing section with Table comparison + Card tiers + Accordion FAQ",
      "Case studies with Carousel + Dialog for full case view",
    ],
    families: ["saas-landing"],
    keywords: ["saas", "startup", "platform", "api", "b2b", "software", "enterprise", "corporate", "agency", "byrå", "konsult", "plattform", "företag", "professional", "trust"],
  },
  {
    id: "retro_atmosphere",
    layoutApproach: "immersive theme-driven sections with cinematic transitions",
    sectionRhythm: "dense narrative block -> spacious atmospheric scene -> dense detail panel",
    signatureMotif: "aged textures, glow bloom, and atmospheric overlays",
    fontMood: "characterful display face with restrained supporting sans",
    fontPairings: [
      { heading: "Abril Fatface", body: "Lato" },
      { heading: "Bungee Shade", body: "Work Sans" },
    ],
    sectionRecipes: [
      "Full-bleed atmospheric hero with gradient overlay + large display type",
      "Narrative timeline using Separator + Collapsible detail panels",
      "Gallery section with Carousel + AspectRatio + Dialog lightbox",
      "Feature cards with HoverCard reveals and themed Badge accents",
    ],
    keywords: ["retro", "vintage", "western", "neon", "cyberpunk", "atmospheric", "nostalgi", "klassisk"],
  },
  {
    id: "minimal_confident",
    layoutApproach: "clean vertical flow with intentional asymmetry and generous whitespace",
    sectionRhythm: "spacious hero -> compact feature lane -> spacious social proof",
    signatureMotif: "large typography, negative space, and restrained single-color punches",
    fontMood: "high-legibility sans with occasional display contrast",
    fontPairings: [
      { heading: "Instrument Sans", body: "Inter" },
      { heading: "Geist", body: "Geist" },
    ],
    sectionRecipes: [
      "Typography-driven hero with minimal CTA and generous whitespace",
      "Feature lane using compact Card row with Separator dividers",
      "Testimonial section with Carousel + Avatar + blockquote",
      "Contact section with Sheet-triggered Form overlay",
    ],
    families: ["base-nextjs"],
    keywords: ["minimal", "clean", "simple", "minimalistisk", "enkel", "ren"],
  },
  {
    id: "warm_editorial",
    layoutApproach: "full-bleed hero with inset content cards and soft borders",
    sectionRhythm: "generous hero -> tight testimonial rail -> generous feature showcase",
    signatureMotif: "warm surface tints, rounded containers, and soft shadow depth",
    fontMood: "friendly rounded sans headings with humanist body text",
    fontPairings: [
      { heading: "DM Serif Display", body: "DM Sans" },
      { heading: "Merriweather", body: "Nunito Sans" },
    ],
    sectionRecipes: [
      "Full-bleed hero with warm gradient overlay + rounded Card inset",
      "Menu or service list using Accordion + Badge pricing",
      "Testimonial rail with Carousel + Avatar + HoverCard bios",
      "Location/hours section with Tabs for multiple branches",
    ],
    families: ["content-site"],
    keywords: [
      "friendly", "warm", "community", "local", "cafe", "bakery", "restaurant",
      "restaurang", "kafé", "bageri", "mat", "food", "catering", "bistro", "konditori",
      "frisör", "spa", "salong", "yoga", "terapi", "klinik", "veterinär", "djur",
      "förskola", "skola", "förening", "kyrka", "ideell",
    ],
  },
  {
    id: "bold_brutalist",
    layoutApproach: "oversized type blocks with hard-edge geometric sections",
    sectionRhythm: "dense impact statement -> spacious gallery -> dense manifest",
    signatureMotif: "raw borders, monospace accents, and stark contrast",
    fontMood: "heavy condensed display with monospace secondary",
    fontPairings: [
      { heading: "Anton", body: "JetBrains Mono" },
      { heading: "Bebas Neue", body: "Space Mono" },
    ],
    sectionRecipes: [
      "Oversized type hero with hard-edge Separator dividers",
      "Project grid using Card with raw borders + Tooltip metadata",
      "Manifest section with large monospace Collapsible blocks",
      "Contact as Dialog with minimal Form and stark contrast",
    ],
    keywords: ["brutalist", "bold", "raw", "punk", "industrial", "grunge", "street", "urban"],
  },
  {
    id: "luxury_noir",
    layoutApproach: "dark immersive hero with scroll-reveal product storytelling",
    sectionRhythm: "cinematic hero -> medium detail panels -> focused conversion strip",
    signatureMotif: "dark surfaces, gold or cream accents, and premium shadows",
    fontMood: "elegant thin serif headings with refined sans body",
    fontPairings: [
      { heading: "Cormorant Garamond", body: "Raleway" },
      { heading: "Italiana", body: "Lato" },
    ],
    sectionRecipes: [
      "Cinematic dark hero with AspectRatio product image + gold Badge accent",
      "Product story using alternating split sections with Drawer detail views",
      "Testimonial section with HoverCard + Avatar on dark Card surfaces",
      "Conversion strip with Dialog CTA and premium form styling",
    ],
    keywords: ["luxury", "premium", "exclusive", "fashion", "jewelry", "elegant", "lyx", "exklusiv", "mode", "smycken"],
  },
  {
    id: "playful_cards",
    layoutApproach: "bento grid hero with interactive card clusters",
    sectionRhythm: "medium bento grid -> compact stats bar -> medium feature cards",
    signatureMotif: "rounded corners, pastel tints, and bouncy hover states",
    fontMood: "rounded geometric sans with playful weight variation",
    fontPairings: [
      { heading: "Nunito", body: "Nunito Sans" },
      { heading: "Quicksand", body: "DM Sans" },
    ],
    sectionRecipes: [
      "Bento grid hero with Card clusters + Badge labels + bouncy hover",
      "Stats bar using Progress indicators + animated counters",
      "Feature showcase with Carousel + Popover detail reveals",
      "Interactive FAQ with Accordion + colorful section backgrounds",
    ],
    keywords: ["playful", "fun", "kids", "game", "creative", "colorful", "lekfull", "barn", "spel", "kreativ", "färgglad"],
  },
  {
    id: "documentation_clarity",
    layoutApproach: "sidebar navigation with structured content panels",
    sectionRhythm: "tight nav -> spacious reading area -> tight quick-links",
    signatureMotif: "code blocks, inline badges, and muted information hierarchy",
    fontMood: "system-optimized monospace and readable sans pairing",
    fontPairings: [
      { heading: "Inter", body: "Inter" },
      { heading: "IBM Plex Sans", body: "IBM Plex Mono" },
    ],
    sectionRecipes: [
      "Sidebar + NavigationMenu with Breadcrumb for deep navigation",
      "Content panel using ScrollArea + Collapsible sections",
      "API reference with Table + Badge for status codes + Tooltip param hints",
      "Search with Command palette + inline code examples",
    ],
    families: ["blog"],
    keywords: ["docs", "documentation", "guide", "tutorial", "reference", "api", "dokumentation", "handbok", "manual"],
  },
  {
    id: "nature_organic",
    layoutApproach: "flowing wave-divided sections with natural imagery overlap",
    sectionRhythm: "expansive scenic hero -> medium card garden -> expansive closing vista",
    signatureMotif: "organic dividers, earth-tone gradients, and leaf-shaped accents",
    fontMood: "organic serif headings with clean ecological sans body",
    fontPairings: [
      { heading: "Fraunces", body: "Nunito Sans" },
      { heading: "Libre Baskerville", body: "Open Sans" },
    ],
    sectionRecipes: [
      "Scenic hero with wave clip-path divider + AspectRatio nature image",
      "Card garden with organic shapes + HoverCard eco-detail reveals",
      "Impact section using Chart for sustainability data + Badge certifications",
      "Contact with Tabs for locations + Form with earth-tone styling",
    ],
    keywords: ["nature", "eco", "green", "organic", "sustainability", "garden", "forest", "natur", "miljö", "hållbar", "trädgård", "skog", "odling"],
  },
  {
    id: "portfolio_showcase",
    layoutApproach: "masonry or staggered project grid with full-bleed case studies",
    sectionRhythm: "compact intro -> dense project grid -> spacious about/contact",
    signatureMotif: "image-forward layout, subtle hover reveals, and project metadata chips",
    fontMood: "display grotesk headings with minimal secondary text",
    fontPairings: [
      { heading: "Space Grotesk", body: "Inter" },
      { heading: "Bricolage Grotesque", body: "DM Sans" },
    ],
    sectionRecipes: [
      "Compact intro hero with Avatar + Badge skills + minimal copy",
      "Project grid with AspectRatio images + HoverCard project details",
      "Case study section using Dialog or Drawer for full-bleed project views",
      "About/contact with Tabs for bio/skills/contact + Form",
    ],
    families: ["portfolio"],
    keywords: ["portfolio", "work", "projects", "cases", "gallery", "fotograf", "designer", "arkitekt", "konstnär", "frilans"],
  },
  {
    id: "tech_terminal",
    layoutApproach: "dark-mode hero with terminal-style code previews and API examples",
    sectionRhythm: "immersive dark hero -> compact feature tabs -> dense integration grid",
    signatureMotif: "code syntax highlights, terminal chrome, and gradient accent borders",
    fontMood: "monospace display with technical sans supporting text",
    fontPairings: [
      { heading: "JetBrains Mono", body: "Inter" },
      { heading: "Fira Code", body: "Space Grotesk" },
    ],
    sectionRecipes: [
      "Terminal-style hero with code preview + Badge version labels",
      "Feature tabs using Tabs + inline code + Tooltip parameter hints",
      "Integration grid with Card + DropdownMenu for framework selection",
      "Docs quickstart with Accordion steps + ScrollArea code blocks",
    ],
    keywords: ["developer", "cli", "terminal", "code", "open-source", "devtools", "utvecklare", "verktyg"],
  },
];

function hashSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

function scorePreset(
  preset: StyleDirectionPreset,
  promptLower: string,
  styleKeywordsLower: string[],
  scaffoldId?: ScaffoldId | null,
): number {
  let score = 0;

  if (scaffoldId && preset.families?.includes(scaffoldId)) {
    score += 4;
  } else if (scaffoldId && preset.families && preset.families.length > 0) {
    score -= 1;
  }

  let keywordHits = 0;
  for (const keyword of preset.keywords ?? []) {
    if (promptLower.includes(keyword)) {
      keywordHits += 1;
    } else if (styleKeywordsLower.some((v) => v.includes(keyword))) {
      keywordHits += 1;
    }
  }
  score += keywordHits * 3;
  if (keywordHits >= 2) score += keywordHits * 2;

  return score;
}

export function pickStyleDirection(input: StyleDirectionInput): StyleDirection {
  const promptLower = input.prompt.toLowerCase();
  const styleKeywordsLower = (input.styleKeywords ?? []).map((v) => v.toLowerCase());

  const ranked = STYLE_DIRECTION_PRESETS
    .map((preset) => ({
      preset,
      score: scorePreset(preset, promptLower, styleKeywordsLower, input.scaffoldId),
    }))
    .sort((a, b) => b.score - a.score || a.preset.id.localeCompare(b.preset.id));

  const topScore = ranked[0]?.score ?? 0;
  const topCandidates = topScore > 0
    ? ranked.filter((r) => r.score > 0).slice(0, 5)
    : ranked.slice(0, 5);

  const seedKey = [
    input.prompt.trim().toLowerCase().slice(0, 200),
    input.scaffoldId ?? "none",
    input.generationMode ?? "init",
    input.sessionSeed ?? "",
  ].join("::");
  const hash = hashSeed(seedKey);
  const chosen = topCandidates[hash % topCandidates.length]?.preset ?? STYLE_DIRECTION_PRESETS[0];

  return {
    id: chosen.id,
    layoutApproach: chosen.layoutApproach,
    sectionRhythm: chosen.sectionRhythm,
    signatureMotif: chosen.signatureMotif,
    fontMood: chosen.fontMood,
    fontPairings: chosen.fontPairings,
    sectionRecipes: chosen.sectionRecipes,
  };
}
