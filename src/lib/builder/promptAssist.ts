// "gateway" refers to Vercel AI Gateway (same gateway API used by /api/ai/* routes).
// "v0" refers to the v0 Model API (openai-compat).
export type PromptAssistProvider = "gateway" | "v0";

export const GATEWAY_ASSIST_MODELS = [
  "openai/gpt-5.2",
  "openai/gpt-5.2-pro",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
] as const;

export const V0_ASSIST_MODELS = ["v0-1.5-md", "v0-1.5-lg"] as const;

export type GatewayAssistModel = (typeof GATEWAY_ASSIST_MODELS)[number];
export type V0AssistModel = (typeof V0_ASSIST_MODELS)[number];

export function normalizeAssistModel(rawModel: string): string {
  const raw = String(rawModel || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("v0-")) return raw;
  if (raw.includes("/")) return raw;
  return `openai/${raw}`;
}

export function isV0AssistModel(model: string): model is V0AssistModel {
  return V0_ASSIST_MODELS.includes(model as V0AssistModel);
}

export function isGatewayAssistModel(model: string): model is GatewayAssistModel {
  return GATEWAY_ASSIST_MODELS.includes(model as GatewayAssistModel);
}

export function isPromptAssistModelAllowed(model: string): boolean {
  return isGatewayAssistModel(model) || isV0AssistModel(model);
}

export function resolvePromptAssistProvider(model: string): PromptAssistProvider {
  return isV0AssistModel(model) ? "v0" : "gateway";
}

const SECTION_KEYWORDS = [
  "hero",
  "features",
  "pricing",
  "faq",
  "testimonials",
  "contact",
  "about",
  "footer",
  "cta",
  "gallery",
  "services",
  "team",
  "blog",
  "navbar",
] as const;

const STYLE_KEYWORDS = [
  "minimal",
  "modern",
  "clean",
  "bold",
  "playful",
  "professional",
  "luxury",
  "dark",
  "light",
  "retro",
  "corporate",
  "soft",
  "elegant",
  "futuristic",
] as const;

const CONSTRAINT_MARKERS = [
  "must",
  "should",
  "avoid",
  "do not",
  "don't",
  "ska",
  "måste",
  "undvik",
  "inte",
  "utan",
] as const;

function normalizeWhitespace(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmedLines = normalized.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return trimmedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractKeywordMatches(value: string, keywords: readonly string[]): string[] {
  const normalized = value.toLowerCase();
  const matches = keywords.filter((keyword) => normalized.includes(keyword));
  return Array.from(new Set(matches));
}

function extractConstraints(value: string): string[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const picked: string[] = [];
  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (CONSTRAINT_MARKERS.some((marker) => lower.includes(marker))) {
      if (!picked.includes(line)) {
        picked.push(line);
      }
    }
  });
  return picked.slice(0, 6);
}

function extractUrls(value: string): string[] {
  const matches = Array.from(value.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);
  return Array.from(new Set(matches)).slice(0, 6);
}

export function formatPromptForV0(prompt: string): string {
  if (!prompt) return "";
  const normalized = normalizeWhitespace(String(prompt));
  if (!normalized) return "";

  const sections = extractKeywordMatches(normalized, SECTION_KEYWORDS);
  const styles = extractKeywordMatches(normalized, STYLE_KEYWORDS);
  const constraints = extractConstraints(normalized);
  const urls = extractUrls(normalized);

  const parts: string[] = ["MÅL", normalized];

  if (sections.length) {
    parts.push("SEKTIONER", sections.join(", "));
  }
  if (styles.length) {
    parts.push("STIL", styles.join(", "));
  }
  if (constraints.length) {
    parts.push("CONSTRAINTS", constraints.map((line) => `- ${line}`).join("\n"));
  }
  if (urls.length) {
    parts.push("ASSETS/ATTACHMENTS", urls.map((url) => `- ${url}`).join("\n"));
  }

  return parts.join("\n\n");
}

export function buildV0RewriteSystemPrompt(params: { codeContext?: string | null } = {}): string {
  const base =
    "You are a prompt engineer for v0 (a website/app builder). " +
    "Rewrite the user request into a single, concrete, high-quality build prompt for v0. " +
    "Keep it concise, include key requirements and UI details, and avoid extra commentary. " +
    "Output ONLY the rewritten prompt.";

  const codeContext = params.codeContext?.trim();
  if (!codeContext) return base;

  return (
    base +
    "\n\nYou also receive a summary of the existing codebase. " +
    "Use it to align the rewrite with the current structure and naming. " +
    "If the request implies edits, reference the most relevant files/components from the context. " +
    "Do not invent files or frameworks that are not in the context. " +
    "Do not output the context itself.\n\n" +
    `Codebase context:\n${codeContext}`
  );
}

type Brief = any;

export function buildV0PromptFromBrief(params: {
  brief: Brief;
  originalPrompt: string;
  imageGenerations: boolean;
}): string {
  const { brief, originalPrompt, imageGenerations } = params;

  const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const asStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean) : [];

  const projectTitle = asString(brief.projectTitle) || "Website";
  const brandName = asString(brief.brandName);
  const pitch = asString(brief.oneSentencePitch);
  const audience = asString(brief.targetAudience);
  const cta = asString(brief.primaryCallToAction);
  const tone = asStringList(brief.toneAndVoice);

  const styleKeywords = asStringList(brief?.visualDirection?.styleKeywords);
  const palette = brief?.visualDirection?.colorPalette || {};
  const typography = brief?.visualDirection?.typography || {};

  const pages: any[] = Array.isArray(brief.pages) ? brief.pages : [];
  const pageLines = pages
    .slice(0, 10)
    .map((p) => {
      const name = asString(p?.name) || "Page";
      const path = asString(p?.path) || "/";
      const purpose = asString(p?.purpose);
      const sections: any[] = Array.isArray(p?.sections) ? p.sections : [];
      const sectionLines = sections.slice(0, 14).map((s) => {
        const type = asString(s?.type) || "section";
        const heading = asString(s?.heading);
        const bullets = asStringList(s?.bullets).slice(0, 8);
        const bulletText = bullets.length ? ` — ${bullets.join("; ")}` : "";
        return `  - ${type}${heading ? `: ${heading}` : ""}${bulletText}`;
      });
      return [
        `- ${name} (${path})${purpose ? `: ${purpose}` : ""}`,
        ...(sectionLines.length ? ["  Sections:", ...sectionLines] : []),
      ].join("\n");
    })
    .join("\n");

  const imagery = brief?.imagery || {};
  const imageryStyle = asStringList(imagery?.styleKeywords);
  const imagerySubjects = asStringList(imagery?.suggestedSubjects);
  const altRules = asStringList(imagery?.altTextRules);

  const ui = brief?.uiNotes || {};
  const uiComponents = asStringList(ui?.components);
  const uiInteractions = asStringList(ui?.interactions);
  const uiA11y = asStringList(ui?.accessibility);

  const seo = brief?.seo || {};
  const seoTitle = asString(seo?.titleTemplate);
  const seoDesc = asString(seo?.metaDescription);
  const seoKeywords = asStringList(seo?.keywords);

  return [
    "Build a beautiful, modern, production-ready website using Next.js (App Router) + Tailwind CSS.",
    "Use shadcn/ui components where appropriate (buttons, inputs, cards, dialogs).",
    "If you use shadcn/ui, ensure required @radix-ui/* deps are present in package.json and components.json + lib/utils.ts (cn helper) exist.",
    "",
    `Project: ${projectTitle}${brandName ? ` (${brandName})` : ""}`,
    pitch ? `One-sentence pitch: ${pitch}` : null,
    audience ? `Target audience: ${audience}` : null,
    cta ? `Primary CTA: ${cta}` : null,
    tone.length ? `Tone: ${tone.join(", ")}` : null,
    "",
    "Pages and information architecture:",
    pageLines || "- Home (/): include a hero, features, and a CTA.",
    "",
    "Visual direction:",
    styleKeywords.length ? `- Style keywords: ${styleKeywords.join(", ")}` : null,
    palette?.primary ? `- Color palette: primary ${String(palette.primary)}` : null,
    typography?.headings || typography?.body
      ? `- Typography: headings ${String(typography.headings || "Inter")}, body ${String(typography.body || "Inter")}`
      : null,
    "",
    imageGenerations
      ? "Imagery: include tasteful images where they add value. Use next/image when appropriate, include descriptive alt text, and use public https image URLs (avoid data: URIs or local file paths)."
      : "Imagery: do not rely on generated images; prioritize layout, typography, and iconography. Images are optional.",
    imageryStyle.length ? `- Image style keywords: ${imageryStyle.join(", ")}` : null,
    imagerySubjects.length ? `- Suggested image subjects: ${imagerySubjects.join(", ")}` : null,
    altRules.length ? `- Alt text rules: ${altRules.join(" | ")}` : null,
    "",
    "UX & UI:",
    uiComponents.length ? `- Components: ${uiComponents.join(", ")}` : null,
    uiInteractions.length ? `- Interactions: ${uiInteractions.join(", ")}` : null,
    uiA11y.length ? `- Accessibility: ${uiA11y.join(", ")}` : null,
    "",
    "SEO:",
    seoTitle ? `- Title template: ${seoTitle}` : null,
    seoDesc ? `- Meta description: ${seoDesc}` : null,
    seoKeywords.length ? `- Keywords: ${seoKeywords.join(", ")}` : null,
    "",
    "Requirements:",
    "- Mobile-first and fully responsive",
    "- Accessible (semantic HTML, keyboard navigation, proper labels/alt text)",
    "- Fast and clean UI (avoid heavy animations; keep it snappy)",
    "- Use consistent spacing, typography scale, and component styling",
    "",
    `Original request (for reference): ${originalPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}
