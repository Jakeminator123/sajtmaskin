// v0 API Generator using @ai-sdk/vercel
// This module handles all communication with v0 API from the backend

import { generateText } from "ai";
import { createVercel } from "@ai-sdk/vercel";

// Lazy-initialized Vercel provider (created at request time, not import time)
let _vercel: ReturnType<typeof createVercel> | null = null;

function getVercelProvider() {
  if (!_vercel) {
    if (!process.env.V0_API_KEY) {
      throw new Error("V0_API_KEY environment variable is not set");
    }
    _vercel = createVercel({
      apiKey: process.env.V0_API_KEY,
    });
  }
  return _vercel;
}

// Map user-facing quality options to v0 models
const MODEL_MAP = {
  budget: "v0-1.5-md", // Fast, cheap ($1.5/$7.5 per 1M tokens)
  standard: "v0-1.5-md", // Balanced (same model as budget)
  premium: "v0-1.5-lg", // Best quality, 10x cost ($15/$75 per 1M tokens)
} as const;

export type QualityLevel = keyof typeof MODEL_MAP;

// Category-specific prompts for initial generation
const CATEGORY_PROMPTS: Record<string, string> = {
  "landing-page": `Create a modern, professional landing page with:
- Hero section with headline and CTA button
- Features/benefits grid (3-4 items)
- Social proof section (testimonials or logos)
- Pricing table with 3 tiers
- FAQ section
- Contact/signup form
- Footer with links
Use a dark theme with blue accents. Make it fully responsive. Use Tailwind CSS for styling.`,

  website: `Create a complete multi-page website structure with:
- Home page with hero and key sections
- About page content
- Services/products page
- Contact page with form
- Consistent header and footer across all pages
Use a professional design. Include navigation between pages. Use Tailwind CSS.`,

  dashboard: `Create an admin dashboard with:
- Sidebar navigation with icons
- Top header with user menu and notifications
- Main content area with metric cards (4 cards)
- Data table with sample data
- Charts section (line or bar chart placeholder)
- Dark theme preferred
Make it fully responsive with collapsible sidebar on mobile. Use Tailwind CSS.`,

  ecommerce: `Create an e-commerce storefront with:
- Header with logo, search bar, cart icon
- Category navigation
- Product grid with images, prices, ratings (6-8 products)
- Filter sidebar (price, category)
- Product quick-view capability
- Footer with links and newsletter signup
Use Tailwind CSS. Make it fully responsive.`,

  blog: `Create a blog website with:
- Header with logo and navigation
- Featured article hero section
- Article grid with thumbnails and excerpts (6 articles)
- Sidebar with categories and popular posts
- Newsletter signup section
- Footer
Use a clean, readable design. Use Tailwind CSS. Make it fully responsive.`,

  portfolio: `Create a portfolio website with:
- Hero section with name and title
- About me section
- Project gallery with hover effects (6 projects)
- Skills/expertise section
- Testimonials section
- Contact form
Use a dark, modern theme. Use Tailwind CSS. Make it fully responsive.`,

  webapp: `Create a web application interface with:
- Clean, functional interface
- Main workspace area
- Toolbar or action buttons
- Settings or configuration panel
- Responsive layout
Focus on usability and functionality. Use Tailwind CSS.`,
};

// Default prompt for custom descriptions
const DEFAULT_SYSTEM_PROMPT = `You are an expert React developer. Generate clean, production-ready React components using:
- React functional components with TypeScript
- Tailwind CSS for styling
- Modern best practices
- Responsive design

Return ONLY the code, no explanations. The code should be a complete, working component.`;

export interface GenerationResult {
  code: string;
  model: string;
}

/**
 * Generate code using v0 API
 */
export async function generateCode(
  prompt: string,
  quality: QualityLevel = "standard",
  categoryType?: string
): Promise<GenerationResult> {
  const modelId = MODEL_MAP[quality];

  // Build the full prompt
  let fullPrompt = DEFAULT_SYSTEM_PROMPT + "\n\n";

  if (categoryType && CATEGORY_PROMPTS[categoryType]) {
    fullPrompt += CATEGORY_PROMPTS[categoryType];
  } else {
    fullPrompt += prompt;
  }

  // Add user's additional instructions if they provided both category and prompt
  if (categoryType && prompt && !prompt.startsWith("Skapa en")) {
    fullPrompt += `\n\nAdditional requirements: ${prompt}`;
  }

  const vercel = getVercelProvider();
  const { text } = await generateText({
    model: vercel(modelId),
    prompt: fullPrompt,
  });

  return {
    code: text,
    model: modelId,
  };
}

/**
 * Refine existing code based on user instructions
 */
export async function refineCode(
  existingCode: string,
  instruction: string,
  quality: QualityLevel = "standard"
): Promise<GenerationResult> {
  const modelId = MODEL_MAP[quality];

  const prompt = `You are an expert React developer. Here is the existing code:

\`\`\`tsx
${existingCode}
\`\`\`

Please modify it according to this instruction: ${instruction}

Requirements:
- Keep the same overall structure
- Only make the requested changes
- Use Tailwind CSS for any styling changes
- Return the COMPLETE updated code, not just the changes
- Return ONLY the code, no explanations`;

  const vercel = getVercelProvider();
  const { text } = await generateText({
    model: vercel(modelId),
    prompt,
  });

  return {
    code: text,
    model: modelId,
  };
}

/**
 * Sanitize response to remove v0/Vercel references (white-label)
 */
export function sanitizeCode(code: string): string {
  return code
    .replace(/v0\.dev/gi, "")
    .replace(/v0\.app/gi, "")
    .replace(/vercel/gi, "")
    .replace(/\/\/ Generated by v0.*\n?/gi, "")
    .replace(/\/\* v0.*\*\/\n?/gi, "")
    .replace(/\s*\/\/ v0.*\n?/gi, "\n");
}
