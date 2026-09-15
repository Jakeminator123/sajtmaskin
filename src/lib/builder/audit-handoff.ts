/**
 * Structured audit → builder handoff.
 *
 * The client stores a short display line plus a validated payload on
 * `prompt_handoffs`. create-chat reads the payload server-side and builds the
 * codegen prompt, brief context, and init hints from that — not from a flattened
 * superprompt in the chat row.
 */
import { z } from "zod";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { AuditResult } from "@/types/audit";

export const AUDIT_HANDOFF_PAYLOAD_KIND = "audit" as const;

const TOP_ISSUES = 8;
const TOP_IMPROVEMENTS = 8;
const MAX_SECTION_CONTENT_CHARS = 1_200;
const MAX_KEYWORD_HINTS = 8;

const sectionTypeSchema = z.enum([
  "hero",
  "services",
  "about",
  "contact",
  "testimonials",
  "portfolio",
  "pricing",
  "faq",
  "team",
  "cta",
  "footer",
  "other",
]);

const improvementSchema = z
  .object({
    item: z.string(),
    impact: z.enum(["high", "medium", "low"]).optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
    why: z.string().optional(),
    how: z.string().optional(),
  })
  .passthrough();

const siteContentSchema = z
  .object({
    company_name: z.string(),
    tagline: z.string().optional(),
    description: z.string(),
    industry: z.string(),
    location: z.string().optional(),
    services: z.array(z.string()).optional(),
    products: z.array(z.string()).optional(),
    unique_selling_points: z.array(z.string()).optional(),
    sections: z.array(
      z.object({
        name: z.string(),
        content: z.string(),
        type: sectionTypeSchema,
      }),
    ),
    ctas: z.array(z.string()).optional(),
    contact: z
      .object({
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        social_links: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const colorThemeSchema = z
  .object({
    primary_color: z.string(),
    secondary_color: z.string().optional(),
    accent_color: z.string().optional(),
    background_color: z.string(),
    text_color: z.string(),
    theme_type: z.enum(["light", "dark", "mixed"]),
    style_description: z.string(),
    design_style: z.string().optional(),
    typography_style: z.string().optional(),
  })
  .passthrough();

const designDirectionSchema = z
  .object({
    style: z.string(),
    color_psychology: z.string(),
    ui_patterns: z.array(z.string()).optional(),
    accessibility_level: z.string(),
  })
  .passthrough();

const businessProfileSchema = z
  .object({
    industry: z.string(),
    company_size: z.string(),
    business_model: z.string(),
    maturity: z.string(),
    core_offers: z.array(z.string()),
    revenue_streams: z.array(z.string()),
  })
  .passthrough();

const targetAudienceSchema = z
  .object({
    demographics: z.string(),
    behaviors: z.string(),
    pain_points: z.string(),
    expectations: z.string(),
  })
  .passthrough();

const contentStrategySchema = z
  .object({
    key_pages: z.array(z.string()).optional(),
    content_types: z.array(z.string()).optional(),
    seo_foundation: z.string().optional(),
    conversion_paths: z.array(z.string()).optional(),
  })
  .passthrough();

const templateDataSchema = z
  .object({
    generation_prompt: z.string(),
    must_have_sections: z.array(z.string()),
    style_notes: z.string(),
    improvements_to_apply: z.array(z.string()),
  })
  .passthrough();

export const auditSourceImageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
  kind: z.enum(["og", "logo", "content"]).optional(),
});

export const auditHandoffPayloadSchema = z
  .object({
    domain: z.string().optional(),
    url: z.string().optional(),
    company: z.string().optional(),
    site_content: siteContentSchema.optional(),
    color_theme: colorThemeSchema.optional(),
    design_direction: designDirectionSchema.optional(),
    business_profile: businessProfileSchema.optional(),
    target_audience_analysis: targetAudienceSchema.optional(),
    content_strategy: contentStrategySchema.optional(),
    audit_scores: z.record(z.string(), z.number()).optional(),
    issues: z.array(z.string()).optional(),
    improvements: z.array(improvementSchema).optional(),
    template_data: templateDataSchema.optional(),
    source_images: z.array(auditSourceImageSchema).max(8).optional(),
  })
  .strict();

export type AuditHandoffPayload = z.infer<typeof auditHandoffPayloadSchema>;
export type AuditSourceImage = z.infer<typeof auditSourceImageSchema>;

export type AuditInitHints = {
  themeColors: ThemeColors | null;
  colorModeHint: "light" | "dark" | null;
  styleKeywordsHint: string[];
  toneKeywordsHint: string[];
  pageCountHint: number | null;
  requestedCapabilities: string[];
};

export type PublicAuditHandoffView = {
  payloadKind: typeof AUDIT_HANDOFF_PAYLOAD_KIND | null;
  domain: string | null;
};

export type AuditComposerToken = {
  payloadKind: typeof AUDIT_HANDOFF_PAYLOAD_KIND;
  domain: string | null;
};

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function uniqueKeywords(values: Array<string | null | undefined>, max = MAX_KEYWORD_HINTS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = asTrimmed(value);
    if (!trimmed) continue;
    const parts = trimmed
      .split(/[,;/|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts.length > 1 ? parts : [trimmed]) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part.slice(0, 40));
      if (out.length >= max) return out;
    }
  }
  return out;
}

function hostnameFromUrl(url: string | null | undefined): string | null {
  const raw = asTrimmed(url);
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

export function resolveAuditHandoffDomain(payload: AuditHandoffPayload): string | null {
  return (
    asTrimmed(payload.domain) ||
    hostnameFromUrl(payload.url) ||
    asTrimmed(payload.site_content?.company_name) ||
    asTrimmed(payload.company)
  );
}

export function publicAuditHandoffView(
  source: string | null | undefined,
  payload: unknown,
): PublicAuditHandoffView {
  const parsed = auditHandoffPayloadSchema.safeParse(payload);
  const isAudit = source === "audit";
  return {
    payloadKind: isAudit ? AUDIT_HANDOFF_PAYLOAD_KIND : null,
    domain: isAudit && parsed.success ? resolveAuditHandoffDomain(parsed.data) : null,
  };
}

function optionalParse<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function extractAuditHandoffPayload(
  result: AuditResult,
  url?: string | null,
): AuditHandoffPayload {
  const sourceImages = Array.isArray(result.scrape_summary?.images)
    ? result.scrape_summary.images
        .map((image) => auditSourceImageSchema.safeParse(image))
        .filter((parsed): parsed is { success: true; data: AuditSourceImage } => parsed.success)
        .map((parsed) => parsed.data)
        .slice(0, 8)
    : undefined;

  return auditHandoffPayloadSchema.parse({
    domain: asTrimmed(result.domain) ?? hostnameFromUrl(url) ?? undefined,
    url: asTrimmed(url) ?? undefined,
    company: asTrimmed(result.company) ?? asTrimmed(result.site_content?.company_name) ?? undefined,
    site_content: optionalParse(siteContentSchema, result.site_content),
    color_theme: optionalParse(colorThemeSchema, result.color_theme),
    design_direction: optionalParse(designDirectionSchema, result.design_direction),
    business_profile: optionalParse(businessProfileSchema, result.business_profile),
    target_audience_analysis: optionalParse(targetAudienceSchema, result.target_audience_analysis),
    content_strategy: optionalParse(contentStrategySchema, result.content_strategy),
    audit_scores: optionalParse(z.record(z.string(), z.number()), result.audit_scores),
    issues: optionalParse(z.array(z.string()), result.issues?.slice(0, TOP_ISSUES)),
    improvements: optionalParse(
      z.array(improvementSchema),
      result.improvements?.slice(0, TOP_IMPROVEMENTS),
    ),
    template_data: optionalParse(templateDataSchema, result.template_data),
    source_images: sourceImages && sourceImages.length > 0 ? sourceImages : undefined,
  });
}

export function buildAuditDisplayPrompt(payload: AuditHandoffPayload): string {
  const subject = resolveAuditHandoffDomain(payload);
  return subject
    ? `Bygg en förbättrad sajt för ${subject}`
    : "Bygg en förbättrad sajt utifrån audit";
}

function formatScores(scores: Record<string, number> | undefined): string[] {
  if (!scores) return [];
  return Object.entries(scores)
    .filter(([, value]) => typeof value === "number")
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${value}/100`);
}

export function buildAuditCodegenPrompt(payload: AuditHandoffPayload): string {
  const lines: string[] = [];
  const domain = resolveAuditHandoffDomain(payload);
  const generationPrompt = asTrimmed(payload.template_data?.generation_prompt);

  lines.push("Bygg en förbättrad sajt utifrån en strukturerad sajtaudit.");
  if (domain) lines.push(`Referens: ${domain}.`);
  if (payload.url && payload.url !== domain) lines.push(`URL: ${payload.url}`);
  lines.push(
    "Behåll varumärkeskänslan (färger, tonalitet, sektioner) men åtgärda bristerna och använd originaltexten nedan — inte en poänglista.",
  );

  if (generationPrompt) {
    lines.push("");
    lines.push("Generation prompt från audit:");
    lines.push(generationPrompt);
  }

  const site = payload.site_content;
  if (site) {
    lines.push("");
    lines.push(`Företag: ${site.company_name}`);
    if (site.tagline) lines.push(`Tagline: ${site.tagline}`);
    if (site.description) lines.push(`Beskrivning: ${site.description}`);
    if (site.industry) lines.push(`Bransch: ${site.industry}`);
    if (site.location) lines.push(`Plats: ${site.location}`);
    if (site.services?.length) lines.push(`Tjänster: ${site.services.join("; ")}`);
    if (site.products?.length) lines.push(`Produkter: ${site.products.join("; ")}`);
    if (site.unique_selling_points?.length) {
      lines.push(`USP: ${site.unique_selling_points.join("; ")}`);
    }
    if (site.ctas?.length) lines.push(`CTA: ${site.ctas.join("; ")}`);
    if (site.contact) {
      const contact = [
        site.contact.email,
        site.contact.phone,
        site.contact.address,
        site.contact.social_links?.join(", "),
      ]
        .filter(Boolean)
        .join(" · ");
      if (contact) lines.push(`Kontakt: ${contact}`);
    }
    if (site.sections.length > 0) {
      lines.push("");
      lines.push("Originalsektioner (använd texten, förbättra struktur och UX):");
      for (const section of site.sections) {
        lines.push(`### ${section.name} [${section.type}]`);
        lines.push(clip(section.content, MAX_SECTION_CONTENT_CHARS));
      }
    }
  }

  if (payload.color_theme) {
    const theme = payload.color_theme;
    lines.push("");
    lines.push("Färgtema:");
    lines.push(
      `primary=${theme.primary_color}; secondary=${theme.secondary_color ?? theme.primary_color}; accent=${theme.accent_color ?? theme.primary_color}; background=${theme.background_color}; text=${theme.text_color}; mode=${theme.theme_type}`,
    );
    if (theme.style_description) lines.push(`Stil: ${theme.style_description}`);
    if (theme.typography_style) lines.push(`Typografi: ${theme.typography_style}`);
  }

  if (payload.design_direction) {
    const design = payload.design_direction;
    lines.push("");
    lines.push("Designriktning:");
    lines.push(`Stil: ${design.style}`);
    if (design.color_psychology) lines.push(`Färgpsykologi: ${design.color_psychology}`);
    if (design.ui_patterns?.length) lines.push(`UI-mönster: ${design.ui_patterns.join(", ")}`);
    if (design.accessibility_level) lines.push(`Tillgänglighet: ${design.accessibility_level}`);
  }

  if (payload.template_data) {
    const template = payload.template_data;
    if (template.must_have_sections.length) {
      lines.push(`Måste ha sektioner: ${template.must_have_sections.join(", ")}`);
    }
    if (template.style_notes) lines.push(`Stilnoter: ${template.style_notes}`);
    if (template.improvements_to_apply.length) {
      lines.push(`Förbättringar att tillämpa: ${template.improvements_to_apply.join("; ")}`);
    }
  }

  const scores = formatScores(payload.audit_scores);
  if (scores.length) {
    lines.push("");
    lines.push(`Audit-poäng: ${scores.join(", ")}`);
  }

  if (payload.issues?.length) {
    lines.push("");
    lines.push("Problem att lösa:");
    for (const issue of payload.issues.slice(0, TOP_ISSUES)) {
      lines.push(`- ${issue}`);
    }
  }

  if (payload.improvements?.length) {
    lines.push("");
    lines.push("Förbättringar:");
    for (const improvement of payload.improvements.slice(0, TOP_IMPROVEMENTS)) {
      const extra = [improvement.impact && `impact ${improvement.impact}`, improvement.why]
        .filter(Boolean)
        .join("; ");
      lines.push(`- ${improvement.item}${extra ? ` (${extra})` : ""}`);
    }
  }

  if (payload.content_strategy?.key_pages?.length) {
    lines.push("");
    lines.push(`Nyckelsidor: ${payload.content_strategy.key_pages.join(", ")}`);
  }

  if (payload.business_profile) {
    const profile = payload.business_profile;
    lines.push("");
    lines.push(
      `Affärsprofil: ${profile.industry}, ${profile.company_size}, ${profile.business_model}, ${profile.maturity}`,
    );
    if (profile.core_offers.length) lines.push(`Erbjudanden: ${profile.core_offers.join("; ")}`);
  }

  if (payload.target_audience_analysis) {
    const audience = payload.target_audience_analysis;
    lines.push("");
    lines.push("Målgrupp:");
    if (audience.demographics) lines.push(`Demografi: ${audience.demographics}`);
    if (audience.pain_points) lines.push(`Smärtpunkter: ${audience.pain_points}`);
    if (audience.expectations) lines.push(`Förväntningar: ${audience.expectations}`);
  }

  lines.push("");
  lines.push(
    "Leverera en klar, konverterande sajt på svenska som kan genereras utan ytterligare frågor.",
  );

  return lines.join("\n");
}

export function buildAuditBriefContext(payload: AuditHandoffPayload): string {
  const lines: string[] = ["Audit context (structured; treat as source of truth for brand and pages):"];
  const domain = resolveAuditHandoffDomain(payload);
  if (domain) lines.push(`- Domain: ${domain}`);
  if (payload.company || payload.site_content?.company_name) {
    lines.push(`- Brand: ${payload.site_content?.company_name ?? payload.company}`);
  }
  if (payload.site_content?.description) {
    lines.push(`- Description: ${clip(payload.site_content.description, 400)}`);
  }
  if (payload.site_content?.industry) lines.push(`- Industry: ${payload.site_content.industry}`);
  if (payload.color_theme) {
    const theme = payload.color_theme;
    lines.push(
      `- Color palette: primary ${theme.primary_color}, secondary ${theme.secondary_color ?? theme.primary_color}, accent ${theme.accent_color ?? theme.primary_color}, background ${theme.background_color}, text ${theme.text_color}`,
    );
    lines.push(`- Color mode: ${theme.theme_type}`);
  }
  if (payload.design_direction?.style) lines.push(`- Style: ${payload.design_direction.style}`);
  if (payload.content_strategy?.key_pages?.length) {
    lines.push(`- Key pages: ${payload.content_strategy.key_pages.join(", ")}`);
  }
  if (payload.site_content?.sections.length) {
    lines.push(
      `- Sections: ${payload.site_content.sections.map((section) => `${section.name} (${section.type})`).join("; ")}`,
    );
  }
  const capabilities = deriveAuditInitHints(payload).requestedCapabilities;
  if (capabilities.length) {
    lines.push(`- Seed requestedCapabilities: ${capabilities.join(", ")}`);
  }
  return lines.join("\n");
}

function mentions(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function deriveAuditInitHints(payload: AuditHandoffPayload): AuditInitHints {
  const theme = payload.color_theme;
  const primary = asTrimmed(theme?.primary_color);
  const secondary = asTrimmed(theme?.secondary_color) ?? primary;
  const accent = asTrimmed(theme?.accent_color) ?? primary;
  const themeColors: ThemeColors | null =
    primary && secondary && accent ? { primary, secondary, accent } : null;

  const colorModeHint: "light" | "dark" | null =
    theme?.theme_type === "dark" ? "dark" : theme?.theme_type === "light" ? "light" : null;

  const styleKeywordsHint = uniqueKeywords([
    payload.design_direction?.style,
    theme?.design_style,
    theme?.style_description,
    ...(payload.design_direction?.ui_patterns ?? []),
  ]);

  const toneKeywordsHint = uniqueKeywords([
    payload.design_direction?.color_psychology,
    payload.site_content?.tagline,
    payload.business_profile?.maturity,
  ]);

  const pageCount = payload.content_strategy?.key_pages?.filter((page) => asTrimmed(page)).length ?? 0;
  const pageCountHint = pageCount > 0 ? Math.min(20, Math.max(1, pageCount)) : null;

  const haystack = [
    payload.site_content?.description,
    payload.site_content?.services?.join(" "),
    payload.site_content?.sections.map((section) => `${section.name} ${section.type} ${section.content}`).join(" "),
    payload.content_strategy?.key_pages?.join(" "),
    payload.template_data?.must_have_sections.join(" "),
    payload.site_content?.contact?.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const requestedCapabilities: string[] = [];
  const addCapability = (id: string) => {
    if (!requestedCapabilities.includes(id)) requestedCapabilities.push(id);
  };
  if (
    payload.site_content?.sections.some((section) => section.type === "contact") ||
    mentions(haystack, ["kontakt", "contact", "formulär", "form"])
  ) {
    addCapability("contact-form");
  }
  if (
    payload.site_content?.sections.some((section) => section.type === "portfolio") ||
    mentions(haystack, ["galleri", "gallery", "portfolio", "lightbox"])
  ) {
    addCapability("gallery-lightbox");
  }
  if (
    asTrimmed(payload.site_content?.contact?.address) ||
    mentions(haystack, ["karta", "map", "hitta hit", "google maps"])
  ) {
    addCapability("map-display");
  }
  if (mentions(haystack, ["boka", "bokning", "booking", "cal.com"])) {
    addCapability("booking");
  }

  return {
    themeColors,
    colorModeHint,
    styleKeywordsHint,
    toneKeywordsHint,
    pageCountHint,
    requestedCapabilities,
  };
}

export function mergeRequestedCapabilities(
  brief: Record<string, unknown>,
  seed: string[],
): Record<string, unknown> {
  if (seed.length === 0) return brief;
  const existing = Array.isArray(brief.requestedCapabilities)
    ? brief.requestedCapabilities.filter((value): value is string => typeof value === "string")
    : [];
  const merged = [...existing];
  for (const id of seed) {
    if (!merged.includes(id)) merged.push(id);
  }
  return { ...brief, requestedCapabilities: merged.slice(0, 12) };
}

export function parseAuditHandoffPayload(value: unknown): AuditHandoffPayload | null {
  const parsed = auditHandoffPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
