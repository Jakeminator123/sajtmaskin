export type PromptAssistProvider = "off" | "gateway" | "openai" | "anthropic";

export function normalizeAssistModel(provider: PromptAssistProvider, rawModel: string): string {
  const raw = String(rawModel || "").trim();
  if (!raw) return raw;

  if (provider === "gateway") {
    if (raw.includes("/")) return raw;

    const rawLower = raw.toLowerCase();
    let providerHint: "openai" | "anthropic" | "xai" | "google" | null = null;
    if (/\bopenai\b/.test(rawLower)) providerHint = "openai";
    else if (/\banthropic\b|\bclaude\b/.test(rawLower)) providerHint = "anthropic";
    else if (/\bxai\b|\bgrok\b/.test(rawLower)) providerHint = "xai";
    else if (/\bgoogle\b|\bgemini\b/.test(rawLower)) providerHint = "google";

    let modelPart = raw
      .replace(/openai|anthropic|xai|google/gi, "")
      .trim()
      .replace(/^\W+|\W+$/g, "")
      .replace(/gbt/gi, "gpt")
      .replace(/\s+/g, "-");

    if (!modelPart && /\bclaude\b/.test(rawLower)) modelPart = raw.trim().replace(/\s+/g, "-");

    modelPart = modelPart.replace(/^gpt[- ]?(\d)(?:[._-]?(\d))?$/i, (_m, major, minor) =>
      minor ? `gpt-${major}.${minor}` : `gpt-${major}`,
    );

    if (!modelPart) modelPart = "gpt-4o-mini";

    if (!providerHint) {
      const m = modelPart.toLowerCase();
      if (m.startsWith("claude")) providerHint = "anthropic";
      else if (m.startsWith("grok")) providerHint = "xai";
      else if (m.startsWith("gemini")) providerHint = "google";
      else providerHint = "openai";
    }

    return `${providerHint}/${modelPart}`;
  }

  const slashIdx = raw.indexOf("/");
  if (slashIdx > 0) return raw.slice(slashIdx + 1);
  return raw;
}

export function buildV0RewriteSystemPrompt(): string {
  return (
    "You are a prompt engineer for v0 (a website/app builder). " +
    "Rewrite the user request into a single, concrete, high-quality build prompt for v0. " +
    "Keep it concise, include key requirements and UI details, and avoid extra commentary. " +
    "Output ONLY the rewritten prompt."
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
      ? "Imagery: include tasteful images where they add value. Use next/image when appropriate and include descriptive alt text."
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
