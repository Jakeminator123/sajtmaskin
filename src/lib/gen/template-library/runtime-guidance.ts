import type {
  TemplateLibraryEntry,
  TemplateLibraryRuntimeGuidance,
} from "./types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function limit(values: string[], max: number): string[] {
  return unique(values).slice(0, max);
}

const STARTER_OR_BOILERPLATE_RE = /\b(starter|boilerplate)\b/i;

export function isStarterOrBoilerplateReference(entry: TemplateLibraryEntry): boolean {
  const useCaseTags = entry.classification?.useCaseTags ?? [];
  if (entry.categorySlug === "starter" || useCaseTags.includes("starter")) return true;
  const text = `${entry.title} ${entry.description} ${entry.summary}`;
  return STARTER_OR_BOILERPLATE_RE.test(text);
}

function hasUseCase(entry: TemplateLibraryEntry, tag: string): boolean {
  return (entry.classification?.useCaseTags ?? []).includes(tag);
}

function hasSiteForm(entry: TemplateLibraryEntry, tag: string): boolean {
  return (entry.classification?.siteFormTags ?? []).includes(tag);
}

function hasTechnicalPattern(entry: TemplateLibraryEntry, tag: string): boolean {
  return (entry.classification?.technicalPatternTags ?? []).includes(tag);
}

export function deriveTemplateRuntimeGuidance(
  entry: TemplateLibraryEntry,
): TemplateLibraryRuntimeGuidance {
  if (entry.runtimeGuidance) {
    return {
      styleRules: limit(entry.runtimeGuidance.styleRules, 4),
      sectionInventory: limit(entry.runtimeGuidance.sectionInventory, 5),
      avoidPatterns: limit(entry.runtimeGuidance.avoidPatterns, 4),
      worldClassRubric: limit(entry.runtimeGuidance.worldClassRubric, 5),
    };
  }

  const styleRules: string[] = [
    "Keep the strongest layout rhythm from the reference, but adapt it to the chosen runtime scaffold.",
    "Prefer polished, production-looking App Router structure over screenshot-faithful clones.",
  ];
  const sectionInventory: string[] = [
    "primary entry section",
    "supporting content section",
  ];
  const avoidPatterns: string[] = [
    "Do not paste large reference code blocks verbatim into the generated site.",
    "Do not let reference aesthetics override the user's actual topic, language, or route plan.",
  ];
  const worldClassRubric: string[] = [
    "Professional hierarchy above the fold: strong headline, CTA clarity, and balanced spacing.",
    "Reusable sections with believable content, not generic lorem-style filler.",
    "Accessible semantics and responsive layout decisions that survive a real Next.js preview.",
  ];

  if (isStarterOrBoilerplateReference(entry)) {
    styleRules.push("Treat starter/boilerplate references as structural baselines, not final visual direction.");
    avoidPatterns.push("Avoid shipping starter-like visual defaults (generic cards, weak hierarchy, placeholder-feel copy).");
    worldClassRubric.push("Final output should feel custom and production-grade, not like a renamed starter.");
  }

  if (entry.signals.dashboard || hasSiteForm(entry, "dashboard") || entry.recommendedScaffoldIds.includes("dashboard")) {
    styleRules.push("Preserve clear information density with persistent navigation and scannable panels.");
    sectionInventory.push("overview metrics", "filters or controls", "table or chart area");
    avoidPatterns.push("Avoid turning dashboard references into generic marketing landing pages.");
    worldClassRubric.push("Dense UI must still feel legible, fast, and trustworthy.");
  }

  if (entry.signals.pricing || hasUseCase(entry, "saas") || entry.recommendedScaffoldIds.includes("saas-landing")) {
    styleRules.push("Use clear value hierarchy, product proof, and pricing rhythm before deep detail.");
    sectionInventory.push("hero", "product proof", "pricing", "FAQ or objections");
    avoidPatterns.push("Avoid weak CTA hierarchy or pricing without surrounding trust signals.");
    worldClassRubric.push("Commercial sections should feel conversion-ready without looking template-generic.");
  }

  if (entry.signals.ecommerce || hasSiteForm(entry, "storefront") || entry.recommendedScaffoldIds.includes("ecommerce")) {
    styleRules.push("Keep storefront hierarchy explicit: browse, compare, and purchase should feel obvious.");
    sectionInventory.push("catalog grid", "product detail", "cart or checkout direction");
    avoidPatterns.push("Avoid hiding product information behind vague marketing copy.");
    worldClassRubric.push("Commerce flows should feel trustworthy, concrete, and price-legible.");
  }

  if (entry.signals.blog || hasSiteForm(entry, "editorial-site") || entry.recommendedScaffoldIds.includes("blog")) {
    styleRules.push("Favor editorial readability, spacing rhythm, and content hierarchy over card spam.");
    sectionInventory.push("article hero", "archive list", "author or credibility block");
    avoidPatterns.push("Avoid collapsing editorial references into generic feature-card marketing.");
    worldClassRubric.push("Reading flow should feel deliberate on both desktop and mobile.");
  }

  if (entry.signals.portfolio || hasSiteForm(entry, "portfolio") || entry.recommendedScaffoldIds.includes("portfolio")) {
    styleRules.push("Let the work itself dominate through imagery, spacing, and case-study framing.");
    sectionInventory.push("project showcase", "case study detail", "bio or credibility block");
    avoidPatterns.push("Avoid burying the portfolio behind excessive product-marketing sections.");
    worldClassRubric.push("Visual presentation should feel curated rather than theme-default.");
  }

  if (entry.signals.auth || hasSiteForm(entry, "auth-flow") || hasTechnicalPattern(entry, "auth") || entry.recommendedScaffoldIds.includes("auth-pages")) {
    styleRules.push("Keep each auth screen single-purpose, calm, and trustworthy.");
    sectionInventory.push("login", "signup", "recovery");
    avoidPatterns.push("Avoid mixing auth flows with unrelated landing-page sections.");
    worldClassRubric.push("Auth pages should feel ready for real product onboarding.");
  }

  if (
    entry.signals.docs ||
    entry.signals.cms ||
    hasSiteForm(entry, "documentation-site") ||
    hasSiteForm(entry, "content-site") ||
    entry.recommendedScaffoldIds.includes("content-site")
  ) {
    styleRules.push("Prioritize content scanning, navigation clarity, and readable documentation rhythm.");
    sectionInventory.push("navigation", "content blocks", "supporting sidebar or related links");
    avoidPatterns.push("Avoid forcing documentation references into pricing-first SaaS structures.");
    worldClassRubric.push("Content-first sites should feel structured, findable, and stable.");
  }

  if (entry.signals.ai || hasTechnicalPattern(entry, "ai")) {
    styleRules.push("AI-facing sections should feel native to the product, not like pasted chatbot chrome.");
    worldClassRubric.push("Interactive or AI-heavy views should still feel grounded in a coherent product shell.");
  }

  if (entry.selectedFiles.some((file) => /layout|sidebar|header/i.test(file.path))) {
    styleRules.push("Keep navigation structure explicit and reusable across routes.");
  }

  if (entry.selectedFiles.some((file) => /pricing|checkout|billing/i.test(file.path))) {
    sectionInventory.push("pricing or billing surface");
  }

  return {
    styleRules: limit(styleRules, 4),
    sectionInventory: limit(sectionInventory, 5),
    avoidPatterns: limit(avoidPatterns, 4),
    worldClassRubric: limit(worldClassRubric, 5),
  };
}
