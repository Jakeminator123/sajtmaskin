/**
 * API Route: Expand prompt using OpenAI
 * POST /api/expand-prompt
 *
 * Takes wizard data and generates a detailed prompt for v0 API.
 * Uses gpt-4o-mini for fast, reliable responses.
 *
 * Also fetches relevant stock photos from Unsplash with markers (P1, P2, etc.)
 * for easy image integration.
 *
 * Note: v0 does the heavy lifting with v0-1.5-md/lg models.
 * We use a cost-efficient model for detailed, well-structured prompts.
 */

import { FEATURES, SECRETS } from "@/lib/config";
import { NextRequest, NextResponse } from "next/server";
import { MarkedImage } from "../unsplash/route";

// Allow 60 seconds for OpenAI response
export const maxDuration = 60;

// OpenAI APIs
const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";
// Model configuration - use gpt-4o-mini for stability, or try gpt-5-mini if available
const PRIMARY_MODEL = "gpt-4o-mini"; // Stable, fast, cost-efficient
const FALLBACK_MODEL = "gpt-4o-mini"; // Same model for chat completions fallback
const WEB_SEARCH_MODEL = "gpt-4o-mini"; // Model that supports web_search tool

// System prompt for expanding user input - optimized for v0 API
const SYSTEM_PROMPT = `You are an expert prompt engineer specializing in v0/Vercel website generation.

Your task: Transform user requirements into a detailed, production-ready prompt that generates stunning websites using React, Next.js, and Tailwind CSS.

═══════════════════════════════════════════════════════════════════
CRITICAL RULES FOR V0 API
═══════════════════════════════════════════════════════════════════

1. WRITE IN ENGLISH ONLY (v0 works best with English prompts)
2. Be SPECIFIC about components, layout, and styling
3. Include exact Tailwind colors using the provided hex codes
4. Start with "Create a..." or "Build a..."
5. Keep under 2500 characters but be comprehensive

═══════════════════════════════════════════════════════════════════
REQUIRED STRUCTURE (include these in order)
═══════════════════════════════════════════════════════════════════

1. HERO SECTION:
   - Full-width hero with gradient or image background
   - Compelling headline (H1) and subheadline
   - Primary CTA button with accent color
   - Optional: animated elements, floating shapes, or particles

2. NAVIGATION:
   - Sticky header with logo, nav links, and CTA
   - Mobile hamburger menu with smooth transitions
   - Transparent header that becomes solid on scroll

3. FEATURES/SERVICES:
   - Grid layout (2-3 columns on desktop)
   - Icons from Lucide React
   - Card-based design with hover effects
   - Clear headings and descriptions

4. SOCIAL PROOF (if applicable):
   - Testimonials with photos and names
   - Client logos or trust badges
   - Statistics or achievements

5. CTA SECTION:
   - Contrasting background
   - Clear value proposition
   - Primary action button

6. FOOTER:
   - Multi-column layout
   - Contact info, social links
   - Copyright notice

═══════════════════════════════════════════════════════════════════
STYLING REQUIREMENTS
═══════════════════════════════════════════════════════════════════

- Use CSS variables for colors: --primary, --secondary, --accent
- Apply gradients: bg-gradient-to-r from-[primary] to-[secondary]
- Add subtle shadows: shadow-lg, shadow-xl
- Include hover states: hover:scale-105, hover:shadow-2xl
- Use transitions: transition-all duration-300
- Apply rounded corners: rounded-lg, rounded-2xl
- Include proper spacing: py-20, px-6, gap-8

═══════════════════════════════════════════════════════════════════
INDUSTRY-SPECIFIC ELEMENTS
═══════════════════════════════════════════════════════════════════

CAFÉ/RESTAURANT:
- Menu section with categories and prices
- Opening hours with stylish formatting
- Image gallery with lightbox
- Reservation/booking CTA
- Location map embed placeholder

RETAIL/SHOP:
- Product showcase grid with hover zoom
- Featured products carousel
- Category navigation
- Special offers banner
- Store locator section

CONSULTING/SERVICES:
- Case studies with results
- Service packages/pricing
- Team member profiles
- Contact form with validation
- FAQ accordion

TECH/STARTUP:
- Product demo video placeholder
- Feature comparison table
- Pricing tiers with recommended badge
- Integration logos
- Documentation link

HEALTH/WELLNESS:
- Calming color palette, soft gradients
- Service/treatment cards
- Practitioner profiles
- Online booking CTA
- Trust certifications

═══════════════════════════════════════════════════════════════════
IMAGE HANDLING (CRITICAL!)
═══════════════════════════════════════════════════════════════════

IMPORTANT: When stock photos are provided with URLs, you MUST include the ACTUAL URLs in the generated code!

Format provided: "P1: https://images.unsplash.com/... (description)"

How to use them in the prompt:
- COPY the full Unsplash URL into the code
- Use next/image or img tag with the actual URL
- Example: <img src="https://images.unsplash.com/photo-..." alt="description" />

Placement:
- P1: Hero section - use as background image or main hero visual
- P2: About/features section - team or concept image
- P3: Services/products section - relevant visual
- P4: Testimonials/team section - people or workspace
- P5: Footer or secondary section

NEVER just write placeholder text like "image here" - use the provided URLs!

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════

Return ONLY the expanded prompt. No explanations, no markdown, no preamble.
Start directly with "Create a..." or "Build a..."`;

// Purpose mapping to English
const PURPOSE_MAP: Record<string, string> = {
  sell: "sell products/services online",
  leads: "generate leads and contact inquiries",
  portfolio: "showcase portfolio and work",
  inform: "inform and educate visitors",
  brand: "build brand awareness",
  booking: "accept bookings and reservations",
};

// Industry mapping to English with detailed context
const INDUSTRY_MAP: Record<string, string> = {
  cafe: "café/coffee shop",
  restaurant: "restaurant/bar",
  retail: "retail store",
  tech: "technology company/SaaS startup",
  consulting: "consulting/professional services firm",
  health: "health/wellness/spa business",
  creative: "creative/design agency",
  education: "education/online courses platform",
  ecommerce: "e-commerce/online store",
  nonprofit: "nonprofit/charity organization",
  realestate: "real estate agency",
  other: "business",
};

// Industry-specific section suggestions for better prompts
const INDUSTRY_SECTIONS: Record<string, string[]> = {
  cafe: [
    "menu with categories",
    "opening hours",
    "image gallery",
    "location with map",
    "reservation form",
    "Instagram feed",
  ],
  restaurant: [
    "menu with prices",
    "chef/team section",
    "reservations",
    "private events",
    "reviews",
    "ambiance gallery",
  ],
  retail: [
    "featured products",
    "categories grid",
    "special offers banner",
    "store locations",
    "newsletter signup",
  ],
  tech: [
    "product demo",
    "features grid",
    "pricing table",
    "integrations",
    "testimonials",
    "documentation CTA",
  ],
  consulting: [
    "services overview",
    "case studies",
    "team profiles",
    "client logos",
    "contact form",
    "FAQ section",
  ],
  health: [
    "services/treatments",
    "practitioners",
    "booking system",
    "testimonials",
    "certifications",
    "wellness tips",
  ],
  creative: [
    "portfolio showcase",
    "services",
    "process/workflow",
    "team",
    "client logos",
    "contact",
  ],
  education: [
    "course catalog",
    "instructor profiles",
    "student testimonials",
    "pricing",
    "learning path",
    "blog",
  ],
  ecommerce: [
    "product grid",
    "categories",
    "featured items",
    "reviews",
    "shipping info",
    "newsletter",
  ],
  nonprofit: [
    "mission statement",
    "impact stats",
    "programs",
    "team",
    "donate CTA",
    "volunteer signup",
  ],
  realestate: [
    "property listings",
    "search filters",
    "agent profiles",
    "testimonials",
    "contact form",
    "neighborhood guides",
  ],
  other: ["about section", "services", "testimonials", "contact form", "FAQ"],
};

// Category type mapping
const CATEGORY_MAP: Record<string, string> = {
  "landing-page": "landing page",
  website: "multi-page website",
  dashboard: "admin dashboard",
};

// Timeout for Unsplash fetch (5 seconds)
const UNSPLASH_TIMEOUT_MS = 5000;

// Fetch images from Unsplash API (v0 allows Unsplash images!)
async function fetchUnsplashImages(industry: string): Promise<MarkedImage[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log("[API/expand-prompt] Unsplash fetch timed out after 5s");
  }, UNSPLASH_TIMEOUT_MS);

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/unsplash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, count: 5 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log("[API/expand-prompt] Unsplash fetch failed, using fallback");
      return [];
    }

    const data = await response.json();
    console.log(
      `[API/expand-prompt] Got ${data.images?.length || 0} images from ${
        data.source
      }`
    );
    return data.images || [];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[API/expand-prompt] Unsplash aborted (timeout)");
      return [];
    }
    console.error("[API/expand-prompt] Error fetching Unsplash images:", error);
    return [];
  }
}

// Format images for prompt inclusion
function formatImagesForPrompt(images: MarkedImage[]): string {
  if (images.length === 0) return "";

  const imageList = images
    .map(
      (img) =>
        `${img.marker}: "${img.url}" - ${img.alt} (Photo by ${img.photographer})`
    )
    .join("\n");

  return `

═══════════════════════════════════════════════════════════════════
STOCK PHOTOS - USE THESE EXACT URLs IN THE CODE!
═══════════════════════════════════════════════════════════════════

${imageList}

INSTRUCTIONS:
- Copy each URL exactly as shown above into the generated code
- Use <img src="URL" /> or next/image with the Unsplash URL
- P1 goes in hero section, P2 in about section, P3 in services, etc.
- These are real, working image URLs from Unsplash - use them!
- ATTRIBUTION: Add small text below images: "Photo by [Name] on Unsplash"`;
}

// Component style labels for prompt generation
const COMPONENT_STYLE_LABELS: Record<string, Record<string, string>> = {
  hero: {
    geometric:
      "Geometric background with animated shapes (like v0 Hero Geometric Background)",
    gradient: "Smooth gradient flow with color transitions",
    particles: "Interactive particle effects",
    minimal: "Clean minimal design with focus on typography",
    video: "Video or animated background loop",
  },
  navigation: {
    sticky: "Sticky header that follows scroll",
    glass: "Glassmorphism effect with blur and transparency",
    glow: "Glow menu with luminous hover effects",
    minimal: "Simple minimal navigation",
    sidebar: "Side navigation panel",
  },
  layout: {
    bento: "Bento grid layout with asymmetric cards (like Apple's design)",
    cards: "Traditional card-based layout",
    sections: "Full-width sections with clear separation",
    masonry: "Pinterest-style masonry grid",
    split: "Split-screen 50/50 layouts",
  },
  effects: {
    none: "No animations - fast and simple",
    scroll: "Scroll-triggered animations (fade in, slide up)",
    parallax: "Parallax scrolling for depth",
    hover: "Interactive hover effects on elements",
    beam: "Animated beams and light rays (like v0 Animated Beam)",
  },
  vibe: {
    modern: "Modern and clean - professional with subtle elegance",
    playful: "Playful and fun - bold colors and personality",
    brutalist: "Brutalist design - raw, bold typography, unconventional",
    luxury: "Luxury and premium - dark themes, gold accents, refined",
    retro: "Retro/vintage aesthetic - nostalgic feel",
    tech: "Tech/futuristic - sci-fi inspired, neon accents",
  },
};

function getComponentStyleLabel(category: string, id: string): string {
  return COMPONENT_STYLE_LABELS[category]?.[id] || id;
}

// Timeout for web search (10 seconds - don't block forever)
const WEB_SEARCH_TIMEOUT_MS = 10000;

// Research industry trends with Web Search (optional enhancement)
// Uses gpt-4o with web_search tool via Responses API
// Has a 10-second timeout to prevent blocking
async function researchIndustryTrends(
  industry: string,
  location: string | undefined,
  apiKey: string,
  companyName?: string,
  inspirationSites?: string[]
): Promise<{ trends: string; sources: Array<{ url: string; title: string }> }> {
  const industryName = INDUSTRY_MAP[industry] || industry;
  const locationStr = location ? ` in ${location}` : " in Sweden/Scandinavia";

  // Build a more comprehensive research prompt
  let prompt = `Research the latest web design trends and best practices for ${industryName} businesses${locationStr}.

REQUIRED INFORMATION:
1. Current website design trends for ${industryName} in 2024-2025
2. Essential features that modern ${industryName} websites must have
3. UX patterns that increase conversion for this industry
4. Color schemes and typography commonly used
5. Mobile-first considerations for this industry`;

  // Add competitor analysis if company name provided
  if (companyName) {
    prompt += `\n\n6. What successful competitors in the ${industryName} space are doing well with their websites`;
  }

  // Add inspiration site analysis if provided
  if (inspirationSites && inspirationSites.length > 0) {
    const sites = inspirationSites.filter((s) => s.trim()).slice(0, 3);
    if (sites.length > 0) {
      prompt += `\n\n7. Analyze these inspiration websites and extract what makes them effective: ${sites.join(
        ", "
      )}`;
    }
  }

  prompt += `

OUTPUT FORMAT (respond in ENGLISH, be specific and actionable):
- Design Trends: [2-3 specific trends]
- Must-Have Features: [3-4 features]
- Conversion Tips: [2-3 tips]
- Color/Typography: [1-2 recommendations]
${
  inspirationSites?.length
    ? "- Inspiration Insights: [key takeaways from analyzed sites]"
    : ""
}

Keep response under 200 words but make it actionable for web design.`;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log("[API/expand-prompt] Web search timed out after 10s");
  }, WEB_SEARCH_TIMEOUT_MS);

  try {
    // Try Responses API with web_search tool
    // Note: web_search only works with gpt-4o and gpt-4o-mini
    // API format: instructions (system), input (user string), tools
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: WEB_SEARCH_MODEL, // gpt-4o-mini supports web_search
        instructions:
          "You are an expert web design researcher. Search the web for current industry trends, competitor websites, and design best practices. Provide specific, actionable insights that can directly inform website design decisions. Always respond in English with practical recommendations that a web designer can implement immediately.",
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(
        "[API/expand-prompt] Web search failed:",
        errorData.error?.message || response.status
      );
      return { trends: "", sources: [] };
    }

    const data = await response.json();

    // Get text from output_text or parse output array
    let trends = data.output_text?.trim() || "";

    if (!trends && data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const content of item.content) {
            if (content.type === "output_text" || content.type === "text") {
              trends = content.text?.trim() || "";
              if (trends) break;
            }
          }
        }
        if (trends) break;
      }
    }

    // Extract sources from annotations
    const sources: Array<{ url: string; title: string }> = [];
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.content && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content.annotations && Array.isArray(content.annotations)) {
              for (const annotation of content.annotations) {
                if (annotation.type === "url_citation" && annotation.url) {
                  sources.push({
                    url: annotation.url,
                    title: annotation.title || annotation.url,
                  });
                }
              }
            }
          }
        }
      }
    }

    return { trends, sources: sources.slice(0, 3) };
  } catch (error) {
    clearTimeout(timeoutId);
    // Check if it was a timeout (AbortError)
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[API/expand-prompt] Web search aborted (timeout)");
      return { trends: "", sources: [] };
    }
    console.error("[API/expand-prompt] Industry research error:", error);
    return { trends: "", sources: [] };
  }
}

// Site feedback mapping
const SITE_LIKES_MAP: Record<string, string> = {
  design: "design/appearance",
  navigation: "navigation/structure",
  content: "content",
  speed: "speed/performance",
  mobile: "mobile responsiveness",
};

const SITE_DISLIKES_MAP: Record<string, string> = {
  outdated: "looks outdated",
  confusing: "confusing navigation",
  slow: "slow/sluggish",
  not_mobile: "poor mobile experience",
  boring: "boring/uninspiring",
  hard_to_update: "difficult to update",
};

interface ComponentChoices {
  hero: string;
  navigation: string;
  layout: string;
  effects: string;
  vibe: string;
}

interface ExpandPromptRequest {
  companyName: string;
  industry?: string;
  location?: string;
  existingWebsite?: string;
  siteLikes?: string[];
  siteDislikes?: string[];
  siteOtherFeedback?: string;
  inspirationSites?: string[];
  purposes: string[];
  targetAudience: string;
  specialWishes: string;
  palette: {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
  } | null;
  customColors: {
    primary: string;
    secondary: string;
    accent: string;
  } | null;
  componentChoices?: ComponentChoices; // v0 design/style choices
  categoryType: string;
  initialPrompt: string;
  websiteAnalysis?: string; // AI analysis of existing website
}

export async function POST(req: NextRequest) {
  console.log("[API/expand-prompt] Request received");

  try {
    const body: ExpandPromptRequest = await req.json();

    const {
      companyName,
      industry,
      location,
      existingWebsite,
      siteLikes,
      siteDislikes,
      siteOtherFeedback,
      inspirationSites,
      purposes,
      targetAudience,
      specialWishes,
      palette,
      customColors,
      componentChoices,
      categoryType,
      initialPrompt,
      websiteAnalysis,
    } = body;

    // Use centralized config for API key
    if (!FEATURES.useOpenAI) {
      console.error("[API/expand-prompt] OpenAI API key not configured");
      return NextResponse.json(
        { success: false, error: "OpenAI API is not configured" },
        { status: 500 }
      );
    }

    const openaiApiKey = SECRETS.openaiApiKey;

    // Build the colors string
    const colors = customColors || palette;
    const colorString = colors
      ? `Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}`
      : "Professional blue theme";

    // Build purposes string
    const purposesString = purposes.map((p) => PURPOSE_MAP[p] || p).join(", ");

    // Build site feedback string
    let siteFeedbackString = "";
    if (existingWebsite) {
      const likes = (siteLikes || [])
        .map((l) => SITE_LIKES_MAP[l] || l)
        .join(", ");
      const dislikes = (siteDislikes || [])
        .map((d) => SITE_DISLIKES_MAP[d] || d)
        .join(", ");

      siteFeedbackString = `
BEFINTLIG SAJT: ${existingWebsite}
${likes ? `Vad de gillar: ${likes}` : ""}
${dislikes ? `Vad de vill ändra: ${dislikes}` : ""}
${siteOtherFeedback ? `Övrig feedback: ${siteOtherFeedback}` : ""}
${websiteAnalysis ? `AI-ANALYS AV BEFINTLIG SAJT: ${websiteAnalysis}` : ""}`;
    }

    // Build inspiration string
    const validInspiration = (inspirationSites || []).filter((s) => s.trim());
    const inspirationString =
      validInspiration.length > 0
        ? `INSPIRATIONSSAJTER: ${validInspiration.join(", ")}`
        : "";

    // Get industry-specific sections
    const industrySections =
      INDUSTRY_SECTIONS[industry || "other"] || INDUSTRY_SECTIONS.other;
    const sectionsString = industrySections.join(", ");

    // Build the user message for OpenAI
    const userMessage = `
═══════════════════════════════════════════════════════════════════
WEBSITE REQUIREMENTS
═══════════════════════════════════════════════════════════════════

COMPANY: ${companyName}
${industry ? `INDUSTRY: ${INDUSTRY_MAP[industry] || industry}` : ""}
${location ? `LOCATION: ${location}` : ""}
TYPE: ${CATEGORY_MAP[categoryType] || categoryType}
PURPOSES: ${purposesString}
TARGET AUDIENCE: ${targetAudience}

═══════════════════════════════════════════════════════════════════
DESIGN SPECIFICATIONS
═══════════════════════════════════════════════════════════════════

COLOR PALETTE:
${colorString}

Apply these colors as:
- Primary: Main buttons, links, headings accent
- Secondary: Backgrounds, cards, secondary elements  
- Accent: CTAs, highlights, hover states

${
  componentChoices
    ? `DESIGN STYLE (from v0 templates):
- Hero: ${getComponentStyleLabel("hero", componentChoices.hero)}
- Navigation: ${getComponentStyleLabel(
        "navigation",
        componentChoices.navigation
      )}
- Layout: ${getComponentStyleLabel("layout", componentChoices.layout)}
- Effects: ${getComponentStyleLabel("effects", componentChoices.effects)}
- Overall Vibe: ${getComponentStyleLabel("vibe", componentChoices.vibe)}

IMPORTANT: Apply these specific styles throughout the website!`
    : ""
}

${
  siteFeedbackString
    ? `═══════════════════════════════════════════════════════════════════
EXISTING WEBSITE CONTEXT
═══════════════════════════════════════════════════════════════════
${siteFeedbackString}`
    : ""
}

${
  inspirationString
    ? `═══════════════════════════════════════════════════════════════════
INSPIRATION
═══════════════════════════════════════════════════════════════════
${inspirationString}`
    : ""
}

═══════════════════════════════════════════════════════════════════
RECOMMENDED SECTIONS FOR ${(
      INDUSTRY_MAP[industry || "other"] || "this business"
    ).toUpperCase()}
═══════════════════════════════════════════════════════════════════
${sectionsString}

${
  specialWishes
    ? `═══════════════════════════════════════════════════════════════════
SPECIAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════
${specialWishes}`
    : ""
}

${
  initialPrompt
    ? `═══════════════════════════════════════════════════════════════════
ORIGINAL DESCRIPTION
═══════════════════════════════════════════════════════════════════
${initialPrompt}`
    : ""
}

═══════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════
Generate a detailed, production-ready prompt for v0 that will create a stunning, modern website with:
- Responsive design (mobile-first)
- Smooth animations and transitions
- Proper accessibility
- SEO-friendly structure
- Clear call-to-actions
`.trim();

    // Run Unsplash fetch and industry research IN PARALLEL for speed
    console.log(
      "[API/expand-prompt] Starting parallel fetch (images + trends)..."
    );
    const startTime = Date.now();

    // Create promises for parallel execution
    const unsplashPromise = fetchUnsplashImages(industry || "other");
    const trendsPromise =
      industry && industry !== "other"
        ? researchIndustryTrends(
            industry,
            location,
            openaiApiKey,
            companyName,
            inspirationSites
          )
        : Promise.resolve({ trends: "", sources: [] });

    // Wait for both to complete (with individual error handling)
    const [stockImages, trendsResult] = await Promise.all([
      unsplashPromise.catch((err) => {
        console.warn("[API/expand-prompt] Unsplash fetch failed:", err);
        return [] as MarkedImage[];
      }),
      trendsPromise.catch((err) => {
        console.warn("[API/expand-prompt] Trends research failed:", err);
        return { trends: "", sources: [] };
      }),
    ]);

    const imagesString = formatImagesForPrompt(stockImages);

    let trendsString = "";
    let industryTrends = "";
    if (trendsResult.trends) {
      industryTrends = trendsResult.trends;
      trendsString = `\n\nINDUSTRY TRENDS & BEST PRACTICES (from web research):\n${trendsResult.trends}`;
    }

    console.log(
      `[API/expand-prompt] Parallel fetch done in ${Date.now() - startTime}ms`,
      {
        imagesCount: stockImages.length,
        hasTrends: !!industryTrends,
      }
    );

    // Add images and trends to user message
    const userMessageWithImages = `${userMessage}
${imagesString}${trendsString}`.trim();

    console.log(
      "[API/expand-prompt] User message length:",
      userMessageWithImages.length
    );

    // Try Responses API first, fallback to Chat Completions if needed
    let usedModel = PRIMARY_MODEL;
    let expandedPrompt: string | undefined;
    let usedResponsesApi = true;

    console.log(
      `[API/expand-prompt] Trying ${PRIMARY_MODEL} with Responses API...`
    );

    // Try Responses API with primary model
    let response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        instructions: SYSTEM_PROMPT, // System prompt as instructions
        input: userMessageWithImages, // User message as input string
      }),
    });

    // If Responses API fails, try Chat Completions as fallback
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(
        `[API/expand-prompt] Responses API failed (${response.status}): ${
          errorData.error?.message || "unknown error"
        }`
      );
      console.log(
        `[API/expand-prompt] Trying ${FALLBACK_MODEL} via Chat Completions...`
      );

      usedModel = FALLBACK_MODEL;
      usedResponsesApi = false;
      response = await fetch(OPENAI_CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessageWithImages },
          ],
          temperature: 0.7,
          max_tokens: 2500,
        }),
      });

      if (!response.ok) {
        const fallbackError = await response.json().catch(() => ({}));
        console.error("[API/expand-prompt] Both APIs failed:", fallbackError);

        if (response.status === 429) {
          return NextResponse.json(
            { success: false, error: "Rate limit exceeded. Try again later." },
            { status: 429 }
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: `API error: ${
              fallbackError.error?.message || "Failed to expand prompt"
            }`,
          },
          { status: 500 }
        );
      }
    }

    const data = await response.json();

    // Parse response based on API type
    if (usedResponsesApi) {
      // Responses API format - try output_text first, then parse output array
      expandedPrompt = data.output_text?.trim();

      // If output_text not available, try parsing the output array
      if (!expandedPrompt && data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === "message" && item.content) {
            for (const content of item.content) {
              if (content.type === "output_text" || content.type === "text") {
                expandedPrompt = content.text?.trim();
                if (expandedPrompt) break;
              }
            }
          }
          if (expandedPrompt) break;
        }
      }
    } else {
      // Chat Completions API format (fallback)
      expandedPrompt = data.choices?.[0]?.message?.content?.trim();
    }

    if (!expandedPrompt) {
      console.error("[API/expand-prompt] No content in response");
      return NextResponse.json(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    console.log(
      `[API/expand-prompt] Success with ${usedModel}, length:`,
      expandedPrompt.length
    );

    return NextResponse.json({
      success: true,
      expandedPrompt,
      model: usedModel,
      images: stockImages, // Include images for frontend reference (Unsplash)
      industryTrends: industryTrends || undefined, // Include trends for database storage
    });
  } catch (error) {
    console.error("[API/expand-prompt] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to expand prompt. Please try again.",
      },
      { status: 500 }
    );
  }
}
