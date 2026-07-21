import type { ColorPalette } from "@/components/forms/color-palette-picker";
import type { BuildIntent } from "@/lib/builder/build-intent";

// ── Types ─────────────────────────────────────────────────────────

export interface ComponentChoices {
  hero: string;
  navigation: string;
  layout: string;
  effects: string;
  vibe: string;
}

export interface WizardData {
  companyName: string;
  industry: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  existingWebsite: string;
  siteLikes: string[];
  siteDislikes: string[];
  siteOtherFeedback: string;
  inspirationSites: string[];
  purposes: string[];
  targetAudience: string;
  specialWishes: string;
  palette: ColorPalette | null;
  customColors: { primary: string; secondary: string; accent: string } | null;
  voiceTranscript?: string;
  componentChoices?: ComponentChoices;
  industryTrends?: string;
  websiteAnalysis?: string;
  usp?: string;
  followUpAnswers?: Record<string, string>;
}

export interface PromptWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: WizardData, expandedPrompt: string) => void;
  initialPrompt?: string;
  /** Pre-fill company name (e.g. from ?company=xxx entry param) */
  initialCompanyName?: string;
  categoryType?: string;
  buildIntent?: BuildIntent;
}

// ── Follow-up question types from API ─────────────────────────────

export interface FollowUpQuestion {
  id: string;
  text: string;
  type: "text" | "select" | "chips";
  options?: string[];
  placeholder?: string;
  priority?: "low" | "medium" | "high";
  dependsOn?: {
    answerId: string;
    includes?: string[];
    excludes?: string[];
  };
}

export interface EnrichSuggestion {
  type: "audience" | "feature" | "usp" | "palette" | "trend";
  text: string;
}

export interface ScrapedData {
  title?: string;
  description?: string;
  headings?: string[];
  wordCount?: number;
  hasImages?: boolean;
  textSummary?: string;
}

export interface EnrichMeta {
  confidence?: number;
  needsClarification?: boolean;
  unknowns?: string[];
  priority?: "low" | "medium" | "high";
}

export interface EnrichResponsePayload {
  questions?: FollowUpQuestion[];
  suggestions?: EnrichSuggestion[];
  insightSummary?: string | null;
  scrapedData?: ScrapedData | null;
  meta?: EnrichMeta;
  contextHash?: string;
}

/** Shape returned by VideoRecorder's onAnalysis (was an inline type in the monolith). */
export interface PresentationAnalysis {
  overallScore?: number;
  toneFeedback?: string;
  pitchFeedback?: string;
  keyMessage?: string;
  strengthHighlight?: string;
}
