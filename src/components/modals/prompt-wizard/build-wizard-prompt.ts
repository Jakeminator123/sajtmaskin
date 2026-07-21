import type { ColorPalette } from "@/components/forms/color-palette-picker";
import { buildIntentNoun } from "@/lib/builder/build-intent";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import type { Competitor } from "@/app/api/wizard/competitors/route";
import {
  DESIGN_FEATURES,
  PURPOSE_OPTIONS,
  VIBE_OPTIONS,
  type IndustryOption,
} from "@/components/modals/prompt-wizard/constants";
import type { PresentationAnalysis, ScrapedData } from "@/components/modals/prompt-wizard/types";

export interface BuildWizardPromptInput {
  companyName: string;
  industry: string;
  location: string;
  existingWebsite: string;
  siteFeedback: string;
  inspirationSites: string[];
  purposes: string[];
  targetAudience: string;
  usp: string;
  specialWishes: string;
  selectedPalette: ColorPalette | null;
  customColors: { primary: string; secondary: string; accent: string } | null;
  selectedVibe: string;
  buildIntent: BuildIntent;
  websiteAnalysis: string | null;
  currentIndustry: IndustryOption | undefined;
  followUpAnswers: Record<string, string>;
  scrapedData: ScrapedData | null;
  presentationAnalysis: PresentationAnalysis | null;
  companyLookup: CompanyLookupResult | null;
  competitors: Competitor[];
  marketInsight: string | null;
  selectedFeatures: Set<string>;
}

// ── Generate clean prompt for builder ─────────────────────────
// The prompt is sent as the first chat message to v0. It should be a
// clear, structured website specification -- NOT a raw data dump.
// The builder's own "deep brief" system (if enabled) will further
// refine this into pages/sections/visual direction.
export function buildWizardPrompt(input: BuildWizardPromptInput): string {
  const {
    companyName,
    industry,
    location,
    existingWebsite,
    siteFeedback,
    inspirationSites,
    purposes,
    targetAudience,
    usp,
    specialWishes,
    selectedPalette,
    customColors,
    selectedVibe,
    buildIntent,
    websiteAnalysis,
    currentIndustry,
    followUpAnswers,
    scrapedData,
    presentationAnalysis,
    companyLookup,
    competitors,
    marketInsight,
    selectedFeatures,
  } = input;

  const palette = customColors || selectedPalette;
  const industryLabel = currentIndustry?.label || industry || "general";
  const intentLabel = buildIntentNoun(buildIntent);
  const vibeLabel = VIBE_OPTIONS.find((v) => v.id === selectedVibe)?.label || selectedVibe;

  // Collect follow-up answers into readable context
  const followUpLines = Object.entries(followUpAnswers)
    .filter(([, v]) => v.trim())
    .map(([, v]) => v);

  // ── Build a structured, readable prompt ─────────────────────
  const sections: string[] = [];

  // 1. Core request (what to build)
  sections.push(
    `Create a ${intentLabel} for "${companyName || "a business"}" in the ${industryLabel} industry.` +
    (location ? ` Based in ${location}.` : ""),
  );

  // 2. Business context (who they are, what makes them unique)
  const businessContext: string[] = [];
  if (usp) businessContext.push(`USP: ${usp}`);
  if (targetAudience) businessContext.push(`Target audience: ${targetAudience}`);
  if (purposes.length) {
    const purposeLabels = purposes.map(
      (p) => PURPOSE_OPTIONS.find((o) => o.id === p)?.label || p,
    );
    businessContext.push(`Primary goals: ${purposeLabels.join(", ")}`);
  }
  if (companyLookup?.found) {
    if (companyLookup.purpose) businessContext.push(`Company description: ${companyLookup.purpose}`);
    if (companyLookup.employees) businessContext.push(`Employees: ~${companyLookup.employees}`);
    if (companyLookup.industries?.length) businessContext.push(`Registered industries: ${companyLookup.industries.join(", ")}`);
  }
  if (followUpLines.length) businessContext.push(...followUpLines);
  if (businessContext.length) {
    sections.push(`\nBusiness profile:\n${businessContext.map((l) => `- ${l}`).join("\n")}`);
  }

  // 3. Design direction (visual style, colors)
  const designParts: string[] = [];
  designParts.push(`Visual style: ${vibeLabel}`);
  if (palette) {
    designParts.push(`Color palette: primary ${palette.primary}, secondary ${palette.secondary}, accent ${palette.accent}`);
  }
  sections.push(`\nDesign direction:\n${designParts.map((l) => `- ${l}`).join("\n")}`);

  // 4. Existing site context (if any -- brief summary only)
  if (existingWebsite || websiteAnalysis || scrapedData) {
    const siteParts: string[] = [];
    if (existingWebsite) siteParts.push(`Current site: ${existingWebsite}`);
    if (scrapedData?.title) siteParts.push(`"${scrapedData.title}" (${scrapedData.wordCount || 0} words)`);
    if (siteFeedback) siteParts.push(`Wants to improve: ${siteFeedback}`);
    if (websiteAnalysis) siteParts.push(`AI analysis summary: ${websiteAnalysis.slice(0, 200)}`);
    sections.push(`\nExisting site context:\n${siteParts.map((l) => `- ${l}`).join("\n")}`);
  }

  // 5. Inspiration + competitors
  const inspirations = inspirationSites.filter((s) => s.trim());
  if (inspirations.length) {
    sections.push(`\nInspiration sites: ${inspirations.join(", ")}`);
  }
  if (competitors.length > 0) {
    const compNames = competitors.slice(0, 4).map((c) =>
      c.website ? `${c.name} (${c.website})` : c.name,
    );
    sections.push(`\nKey competitors in the area: ${compNames.join(", ")}`);
    if (marketInsight) sections.push(`Market insight: ${marketInsight}`);
  }

  // 6. Special requirements (features, wishes, voice/video input)
  const requirements: string[] = [];
  if (specialWishes) {
    // Clean up voice/video transcript markers for a cleaner prompt
    const cleaned = specialWishes
      .replace(/\[Röstinmatning\]:\s*/g, "")
      .replace(/\[Videopresentation\]:\s*/g, "")
      .trim();
    if (cleaned) requirements.push(cleaned);
  }
  if (specialWishes && currentIndustry?.suggestedFeatures?.length) {
    const included = currentIndustry.suggestedFeatures.filter((f) =>
      specialWishes.toLowerCase().includes(f.toLowerCase()),
    );
    if (included.length) requirements.push(`Include: ${included.join(", ")}`);
  }
  if (requirements.length) {
    sections.push(`\nSpecial requirements:\n${requirements.map((l) => `- ${l}`).join("\n")}`);
  }

  // 7. Presentation insights (brief summary, not dominant)
  if (presentationAnalysis?.keyMessage) {
    sections.push(
      `\nFounder's pitch summary: "${presentationAnalysis.keyMessage}"` +
      (presentationAnalysis.strengthHighlight ? ` (Strength: ${presentationAnalysis.strengthHighlight})` : ""),
    );
  }

  // 8. Design feature preferences
  const featureLines = DESIGN_FEATURES
    .filter((f) => selectedFeatures.has(f.id))
    .map((f) => f.promptText);
  if (featureLines.length) {
    sections.push(`\nTechnical preferences:\n${featureLines.map((l) => `- ${l}`).join("\n")}`);
  }

  // 9. Build intent hint
  const intentHint =
    buildIntent === "template"
      ? "Keep scope compact: 1-2 pages, no complex app logic."
      : buildIntent === "app"
        ? "Include interactive flows, stateful UI, and data models."
        : "Focus on clear structure, purposeful content, and flows that match the user's goal.";
  sections.push(`\nScope: ${intentHint}`);

  return sections.join("\n");
}
