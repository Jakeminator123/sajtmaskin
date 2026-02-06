/**
 * Prompt Assist Context - Spec-First Chain
 * =========================================
 *
 * This module implements the "spec-first" pattern from the ChatGPT conversation:
 * 1. Use v0-1.5-lg via AI Gateway to generate a structured spec from user prompt
 * 2. Use that spec to send to Platform API for better code generation
 *
 * The spec contains:
 * - siteName, tagline, pitch
 * - tone and visual direction
 * - pages and sections
 * - must-have and avoid constraints
 *
 * This approach gives higher quality results because:
 * - v0-1.5-lg has 512K context and better reasoning
 * - Platform API receives a structured, clear spec instead of raw user input
 */

import { generateObject } from "ai";
import { gateway } from "ai";
import { z } from "zod";

// Spec schema for structured output
const websiteSpecSchema = z.object({
  siteName: z.string().describe("The name of the website/app"),
  tagline: z.string().describe("A short tagline or slogan"),
  oneSentencePitch: z.string().describe("One sentence explaining the value proposition"),
  targetAudience: z.string().describe("Who is this website for"),
  tone: z
    .enum(["friendly", "professional", "playful", "luxury", "minimal", "corporate", "casual"])
    .describe("The overall tone of the website"),
  primaryColorHint: z
    .string()
    .describe("Suggested primary color (e.g., 'blue', 'purple', '#8b5cf6')"),
  pages: z
    .array(
      z.object({
        path: z.string().describe("URL path like '/' or '/about'"),
        name: z.string().describe("Page name like 'Home' or 'About'"),
        sections: z
          .array(z.string())
          .describe("Section types like 'hero', 'features', 'pricing', 'faq', 'cta'"),
      }),
    )
    .describe("Pages to create"),
  cta: z.object({
    primary: z.string().describe("Primary call-to-action text"),
    secondary: z.string().optional().describe("Secondary call-to-action text"),
  }),
  mustHave: z.array(z.string()).describe("Features that must be included"),
  avoid: z.array(z.string()).describe("Things to avoid"),
});

export type WebsiteSpec = z.infer<typeof websiteSpecSchema>;

// Default fallback spec when generation fails
const DEFAULT_SPEC: WebsiteSpec = {
  siteName: "New Website",
  tagline: "A modern web experience",
  oneSentencePitch: "A beautiful, responsive website built with modern technologies",
  targetAudience: "General audience",
  tone: "professional",
  primaryColorHint: "blue",
  pages: [
    {
      path: "/",
      name: "Home",
      sections: ["hero", "features", "pricing", "faq", "cta"],
    },
  ],
  cta: {
    primary: "Get Started",
    secondary: "Learn More",
  },
  mustHave: ["Responsive design", "Dark mode support", "Accessible"],
  avoid: ["Lorem ipsum", "Broken links"],
};

const SPEC_SYSTEM_PROMPT = `You are a senior product manager and UX designer. Your job is to transform a user's website request into a structured specification.

Analyze the user's request and extract:
1. What they want to build (name, tagline, pitch)
2. Who it's for (target audience)
3. What tone/style they want
4. What pages and sections to include
5. Key features and constraints

Be specific and concrete. If details are missing, make reasonable assumptions based on best practices.

Output a JSON object matching the schema exactly. Do not include any explanations or markdown.`;

/**
 * Generate a website spec from user prompt using v0-1.5-lg via AI Gateway
 *
 * @param userPrompt - The user's original website request
 * @returns A structured WebsiteSpec
 */
export async function generateWebsiteSpec(userPrompt: string): Promise<WebsiteSpec> {
  try {
    // Use AI Gateway with v0-1.5-lg model (or fallback to claude)
    const model = gateway("anthropic/claude-sonnet-4.5"); // v0-1.5-lg not available via gateway yet

    const result = await generateObject({
      model,
      schema: websiteSpecSchema,
      system: SPEC_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxRetries: 2,
    });

    return result.object;
  } catch (error) {
    console.error("Failed to generate website spec:", error);
    // Return default spec with user prompt incorporated
    return {
      ...DEFAULT_SPEC,
      oneSentencePitch: userPrompt.slice(0, 200),
    };
  }
}

/**
 * Build a v0 Platform API prompt from a structured spec
 *
 * @param spec - The generated website spec
 * @param originalPrompt - The user's original prompt (for reference)
 * @returns A formatted prompt for v0 Platform API
 */
export function buildPlatformPromptFromSpec(spec: WebsiteSpec, originalPrompt: string): string {
  const pagesDescription = spec.pages
    .map((page) => {
      const sections = page.sections.join(", ");
      return `  - ${page.name} (${page.path}): ${sections}`;
    })
    .join("\n");

  return `Build a beautiful, production-ready website with the following specifications:

PROJECT
- Name: ${spec.siteName}
- Tagline: ${spec.tagline}
- Pitch: ${spec.oneSentencePitch}
- Target audience: ${spec.targetAudience}

VISUAL DIRECTION
- Tone: ${spec.tone}
- Primary color hint: ${spec.primaryColorHint}

PAGES & SECTIONS
${pagesDescription}

CALL TO ACTION
- Primary CTA: ${spec.cta.primary}
${spec.cta.secondary ? `- Secondary CTA: ${spec.cta.secondary}` : ""}

MUST HAVE
${spec.mustHave.map((item) => `- ${item}`).join("\n")}

AVOID
${spec.avoid.map((item) => `- ${item}`).join("\n")}

TECHNICAL REQUIREMENTS
- Next.js App Router + TypeScript
- Tailwind CSS for styling
- shadcn/ui components where appropriate
- Mobile-first, fully responsive
- Accessible (semantic HTML, keyboard navigation, proper alt text)
- Fast and clean UI

Original request (for context): ${originalPrompt}`;
}

/**
 * Process a user prompt through the spec-first chain
 *
 * This is the main entry point for the spec-first approach:
 * 1. Generate a spec from the user prompt
 * 2. Build a Platform API prompt from the spec
 *
 * @param userPrompt - The user's original website request
 * @returns Object containing spec and formatted prompt
 */
export async function processPromptWithSpec(userPrompt: string): Promise<{
  spec: WebsiteSpec;
  enhancedPrompt: string;
}> {
  const spec = await generateWebsiteSpec(userPrompt);
  const enhancedPrompt = buildPlatformPromptFromSpec(spec, userPrompt);

  return {
    spec,
    enhancedPrompt,
  };
}

// ── Spec file generation ────────────────────────────────────────────────
// Converts a brief (from /api/ai/brief) into a structured JSON spec that
// can be pushed to the v0 project as sajtmaskin.spec.json (locked file).

import type { ThemeColors } from "./theme-presets";

type BriefLike = Record<string, unknown>;

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStrList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => asStr(x)).filter(Boolean) : [];
}

export interface SajtmaskinSpec {
  version: string;
  business: {
    name: string;
    tagline: string;
    tone: string[];
    audience: string;
  };
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    font: string;
    styleKeywords: string[];
  };
  pages: Array<{
    path: string;
    name: string;
    sections: string[];
  }>;
  constraints: {
    noNewDependencies: boolean;
    originalPrompt: string;
  };
}

/**
 * Convert an AI brief into a persistent spec file.
 * Optionally override theme colors with a selected preset.
 */
export function briefToSpec(
  brief: BriefLike,
  originalPrompt: string,
  themeOverride?: ThemeColors | null,
): SajtmaskinSpec {
  const vis = (brief.visualDirection as Record<string, unknown>) || {};
  const palette = (vis.colorPalette as Record<string, unknown>) || {};
  const typo = (vis.typography as Record<string, unknown>) || {};
  const pages = Array.isArray(brief.pages) ? brief.pages : [];

  return {
    version: "1.0",
    business: {
      name: asStr(brief.projectTitle) || asStr(brief.brandName) || "Website",
      tagline: asStr(brief.oneSentencePitch) || "",
      tone: asStrList(brief.toneAndVoice),
      audience: asStr(brief.targetAudience) || "",
    },
    theme: {
      primary: themeOverride?.primary || asStr(palette.primary) || "",
      secondary: themeOverride?.secondary || asStr(palette.secondary) || "",
      accent: themeOverride?.accent || asStr(palette.accent) || "",
      font: asStr(typo.headings) || "system",
      styleKeywords: asStrList(vis.styleKeywords),
    },
    pages: pages.slice(0, 10).map((p: Record<string, unknown>) => {
      const sections = Array.isArray(p.sections) ? p.sections : [];
      return {
        path: asStr(p.path) || "/",
        name: asStr(p.name) || "Page",
        sections: sections
          .slice(0, 14)
          .map((s: unknown) => {
            if (typeof s === "string") return s;
            if (s && typeof s === "object" && "type" in s)
              return asStr((s as Record<string, unknown>).type);
            return "";
          })
          .filter(Boolean),
      };
    }),
    constraints: {
      noNewDependencies: true,
      originalPrompt: originalPrompt.slice(0, 500),
    },
  };
}

/**
 * Build a minimal spec from just the user prompt (no brief available).
 * Used when deep brief is disabled but spec mode is active.
 */
export function promptToSpec(
  originalPrompt: string,
  themeOverride?: ThemeColors | null,
): SajtmaskinSpec {
  return {
    version: "1.0",
    business: {
      name: "Website",
      tagline: "",
      tone: [],
      audience: "",
    },
    theme: {
      primary: themeOverride?.primary || "",
      secondary: themeOverride?.secondary || "",
      accent: themeOverride?.accent || "",
      font: "system",
      styleKeywords: [],
    },
    pages: [{ path: "/", name: "Home", sections: ["hero", "features", "cta"] }],
    constraints: {
      noNewDependencies: true,
      originalPrompt: originalPrompt.slice(0, 500),
    },
  };
}

// ── End spec file generation ────────────────────────────────────────────

export type ContextFile = { name: string; content?: string | null };

const CONTEXT_MAX_FILES = 6;
const CONTEXT_MAX_FILE_LINES = 12;
const CONTEXT_MAX_FILE_CHARS = 420;
const CONTEXT_MAX_TOTAL_CHARS = 2200;

function scoreContextFile(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes("app/page")) return 0;
  if (lower.includes("app/layout")) return 1;
  if (lower.includes("app/")) return 2;
  if (lower.includes("components/")) return 3;
  if (lower.endsWith(".tsx") || lower.endsWith(".ts")) return 4;
  return 5;
}

function summarizeFileContent(content: string): string {
  const lines = content.split(/\r?\n/).slice(0, CONTEXT_MAX_FILE_LINES);
  let snippet = lines.join("\n").trim();
  if (snippet.length > CONTEXT_MAX_FILE_CHARS) {
    snippet = `${snippet.slice(0, CONTEXT_MAX_FILE_CHARS)}…`;
  }
  return snippet;
}

export function buildPromptAssistContext(files: ContextFile[]): string {
  if (!files?.length) return "";

  const fileNames = files.map((file) => file.name).filter(Boolean);
  const listLines = [
    "Files:",
    ...fileNames.slice(0, 20).map((name) => `- ${name}`),
  ];
  if (fileNames.length > 20) {
    listLines.push(`- ... (${fileNames.length - 20} more)`);
  }

  const withContent = files
    .filter((file) => typeof file.content === "string" && file.content?.trim())
    .sort((a, b) => scoreContextFile(a.name) - scoreContextFile(b.name))
    .slice(0, CONTEXT_MAX_FILES);

  let totalChars = 0;
  const snippetLines: string[] = [];
  for (const file of withContent) {
    const snippet = summarizeFileContent(file.content ?? "");
    if (!snippet) continue;
    totalChars += snippet.length;
    if (totalChars > CONTEXT_MAX_TOTAL_CHARS) break;
    snippetLines.push(`File: ${file.name}\n${snippet}`);
  }

  const sections = [listLines.join("\n")];
  if (snippetLines.length) {
    sections.push(`Snippets:\n${snippetLines.join("\n\n")}`);
  }

  return sections.join("\n\n");
}
