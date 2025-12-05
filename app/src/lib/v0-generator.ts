/**
 * v0 API Generator
 * =================
 *
 * KÄRNMODUL för all AI-kodgenerering. Kommunicerar med Vercel's v0 Platform API.
 *
 * API-TYPER (båda använder samma V0_API_KEY):
 * - Platform API (v0-sdk): Returnerar filer, demoUrl, chatId - ANVÄNDS HÄR
 * - Model API (@ai-sdk/vercel): OpenAI-kompatibelt, returnerar text - EJ ANVÄND
 *
 * HUVUDFUNKTIONER:
 *
 * 1. generateCode(prompt, quality)
 *    - Skapar ny webbplats från prompt
 *    - Returnerar: { code, files, demoUrl, chatId, versionId }
 *
 * 2. refineCode(code, instruction, chatId, quality)
 *    - Förfinar existerande kod baserat på instruktion
 *    - Använder chatId för konversationskontext
 *    - Returnerar: uppdaterad kod + ny demoUrl
 *
 * 3. generateFromTemplate(templateId, quality)
 *    - Initierar från v0 community template
 *    - Returnerar: template-kod + demoUrl
 *
 * VIKTIGA RETURVÄRDEN:
 * - demoUrl: Hostad preview på Vercels servrar (visas i iframe)
 * - chatId: ID för att fortsätta konversation (refinement)
 * - versionId: ID för att ladda ner ZIP
 * - files: Array av genererade filer
 *
 * STATUS-HANTERING:
 * - "pending": Generering pågår → vänta och polla
 * - "completed": Klart → returnera resultat
 * - "failed": Fel → sluta polla, logga error
 *
 * MODELLER (2 st):
 * - v0-1.5-md: Standard (128K context, snabb, $1.5/$7.5 per 1M tokens)
 * - v0-1.5-lg: Premium (512K context, bäst, $15/$75 per 1M tokens)
 *
 * DEBUG: Alla operationer loggas till console med [v0-generator] prefix.
 */

import { createClient, type ChatDetail } from "v0-sdk";

// Lazy-initialized v0 client (created at request time, not import time)
let _v0Client: ReturnType<typeof createClient> | null = null;

function getV0Client() {
  if (!_v0Client) {
    if (!process.env.V0_API_KEY) {
      throw new Error("V0_API_KEY environment variable is not set");
    }
    // Note: v0-sdk doesn't support timeout config
    // Long-running operations (5+ min) may timeout at HTTP level
    // maxDuration in route.ts is set to 600s to help
    _v0Client = createClient({
      apiKey: process.env.V0_API_KEY,
    });
  }
  return _v0Client;
}

/**
 * v0 Model Configuration
 * ======================
 *
 * TWO quality levels (mapped to v0 models):
 * - standard: v0-1.5-md (128K context, fast, cheap)
 * - premium:  v0-1.5-lg (512K context, best quality, 10x cost)
 *
 * Pricing (per 1M tokens):
 * - v0-1.5-md: $1.5 input / $7.5 output
 * - v0-1.5-lg: $15 input / $75 output
 *
 * Note: There's also v0-1.0-md (legacy) but we don't use it.
 */
const MODEL_MAP = {
  standard: "v0-1.5-md", // Fast, 128K context ($1.5/$7.5 per 1M tokens)
  premium: "v0-1.5-lg", // Best quality, 512K context ($15/$75 per 1M tokens)
} as const;

export type QualityLevel = keyof typeof MODEL_MAP;

// Category-specific prompts for initial generation
// These are detailed prompts that guide v0 to generate high-quality, production-ready code
const CATEGORY_PROMPTS: Record<string, string> = {
  "landing-page": `Create a stunning, conversion-optimized landing page with:

HERO SECTION (full viewport height):
- Large, bold headline (H1) with gradient text effect
- Compelling subheadline explaining the value proposition
- Primary CTA button with hover animation (scale + shadow)
- Secondary CTA link
- Optional: floating shapes, particles, or subtle animation
- Background: gradient or subtle pattern

FEATURES SECTION:
- 3-4 feature cards in a responsive grid
- Each card: icon (Lucide), title, description
- Hover effect: subtle lift + shadow
- Alternating background pattern for visual interest

SOCIAL PROOF:
- Testimonials carousel OR static grid (2-3 testimonials)
- Avatar image placeholder, name, title, company
- Optional: star rating
- Client/partner logo bar

PRICING SECTION:
- 3 pricing tiers in cards
- Middle tier highlighted as "Popular"
- Feature list with checkmarks
- CTA button per tier
- Monthly/yearly toggle (optional)

FAQ SECTION:
- Accordion-style FAQ (5-6 questions)
- Smooth expand/collapse animation
- Common questions about the product/service

CTA SECTION:
- Full-width section with contrasting background
- Compelling headline
- Email signup form OR CTA button

FOOTER:
- Multi-column layout (4 columns on desktop)
- Logo, description
- Quick links, social icons
- Copyright notice

DESIGN REQUIREMENTS:
- Dark theme with teal/cyan accents (or user's color scheme)
- Smooth scroll behavior
- Intersection Observer animations (fade in on scroll)
- Mobile-first responsive design
- Sticky header with blur background effect`,

  website: `Create a professional multi-section website with:

NAVIGATION:
- Sticky header with logo and nav links
- Mobile hamburger menu with smooth slide animation
- Active link indicator
- CTA button in header

HOME PAGE SECTIONS:
1. Hero with headline, subheadline, CTA
2. About/Introduction section
3. Services/Products grid (4-6 items)
4. Why Choose Us (3-4 differentiators)
5. Testimonials slider
6. Contact CTA section
7. Footer

SERVICES/PRODUCTS SECTION:
- Card-based grid layout
- Image placeholder, title, description
- "Learn more" link per item
- Category filtering (optional)

ABOUT SECTION:
- Company story/mission
- Team photos placeholder (2-3 members)
- Stats/achievements (3-4 numbers)

CONTACT SECTION:
- Contact form (name, email, message)
- Form validation visual feedback
- Address, phone, email info
- Optional: embedded map placeholder

DESIGN REQUIREMENTS:
- Professional, trustworthy aesthetic
- Consistent spacing and typography scale
- Smooth transitions between sections
- Schema-ready semantic HTML
- Full responsive design (mobile, tablet, desktop)`,

  dashboard: `Create a modern admin dashboard with:

LAYOUT STRUCTURE:
- Fixed sidebar (collapsible on mobile)
- Top header bar
- Main scrollable content area
- Dark theme with accent colors

SIDEBAR:
- Logo at top
- Navigation menu with icons (Lucide)
- Sections: Dashboard, Analytics, Users, Settings, etc.
- Active state indicator
- Collapse toggle button
- User profile section at bottom

TOP HEADER:
- Search input with keyboard shortcut hint
- Notification bell with badge count
- User avatar dropdown menu
- Quick action button

DASHBOARD CONTENT:
- Welcome message with date
- Metric cards row (4 cards):
  * Total Revenue, Users, Orders, Growth %
  * Each with icon, value, change indicator
- Charts section:
  * Line chart placeholder (Revenue over time)
  * Pie/donut chart placeholder (Distribution)
- Recent Activity table:
  * Columns: Date, User, Action, Status
  * Status badges (Success, Pending, Failed)
  * Pagination controls
- Quick Actions panel

DESIGN REQUIREMENTS:
- Dark theme (gray-900 base, gray-800 cards)
- Accent color for highlights (teal/blue)
- Data visualization placeholders (can use placeholder data)
- Responsive: sidebar collapses to overlay on mobile
- Subtle hover states on interactive elements
- Loading state skeletons (optional)`,

  ecommerce: `Create a modern e-commerce storefront with:

NAVIGATION:
- Logo, search bar, cart icon with count, user menu
- Category dropdown menu
- Mobile-friendly navigation

PRODUCT GRID:
- Responsive grid (2-4 columns based on screen)
- Product cards: image, title, price, rating, add to cart
- Hover: quick view button, wishlist heart
- Category filters sidebar

PRODUCT QUICK VIEW:
- Image gallery with thumbnails
- Title, price, description
- Size/color selector
- Quantity selector
- Add to cart button
- Reviews summary

FEATURED SECTIONS:
- Hero banner with promotional content
- Best sellers carousel
- New arrivals grid
- Categories showcase

CART PREVIEW:
- Slide-out cart drawer
- Item list with quantity controls
- Subtotal and checkout button

FOOTER:
- Customer service links
- Payment method icons
- Newsletter signup`,

  "blog-portfolio": `Create a creative portfolio/blog with:

PORTFOLIO GRID:
- Masonry or grid layout for projects
- Image thumbnails with hover overlay
- Project title, category, date
- Lightbox or modal for project details
- Category filtering

ABOUT SECTION:
- Large hero image/avatar
- Bio text with personality
- Skills/tools list
- Download resume button

BLOG SECTION:
- Article cards with featured image
- Title, excerpt, date, read time
- Category tags
- Pagination or infinite scroll

CONTACT:
- Creative contact form
- Social media links
- Availability status

DESIGN:
- Creative, portfolio-worthy aesthetic
- Subtle animations and transitions
- Typography-focused design
- Dark/light theme toggle (optional)`,
};

// System prompt for v0 to generate better code
const SYSTEM_PROMPT = `You are an expert React and Next.js developer creating production-ready websites.

TECHNICAL REQUIREMENTS:
- React 18+ functional components with TypeScript
- Tailwind CSS for ALL styling (no external CSS files)
- Lucide React for icons (import from 'lucide-react')
- Next.js App Router conventions
- Responsive design (mobile-first approach)

CODE QUALITY:
- Clean, readable code with proper formatting
- Semantic HTML elements (nav, main, section, article)
- Proper TypeScript types (no 'any')
- Accessible (ARIA labels, keyboard navigation, focus states)
- SEO-friendly structure (proper heading hierarchy)

STYLING GUIDELINES:
- Use Tailwind utility classes exclusively
- Consistent spacing scale (4, 8, 12, 16, 24, 32, 48)
- CSS variables for theme colors when appropriate
- Smooth transitions: transition-all duration-300
- Proper hover/focus/active states

COMPONENT STRUCTURE:
- Single file when possible
- Extract repeated patterns into sub-components
- Props interfaces for reusable components
- Default export for main component`;

export interface GeneratedFile {
  name: string;
  content: string;
}

export interface GenerationResult {
  code: string;
  files: GeneratedFile[];
  chatId: string;
  demoUrl?: string;
  screenshotUrl?: string;
  versionId?: string;
  webUrl?: string;
  model: string;
}

/**
 * Download a chat version as ZIP
 */
export async function downloadVersionAsZip(
  chatId: string,
  versionId: string
): Promise<ArrayBuffer> {
  const v0 = getV0Client();
  return v0.chats.downloadVersion({
    chatId,
    versionId,
    format: "zip",
    includeDefaultFiles: true,
  });
}

/**
 * Wait for a chat version to be ready (poll for completion)
 */
async function waitForVersionReady(
  chatId: string,
  maxAttempts = 120, // 120 × 5s = 10 minutes timeout
  delayMs = 5000 // 5 seconds between polls
): Promise<ChatDetail | null> {
  const v0 = getV0Client();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[v0-generator] Polling version status (attempt ${attempt}/${maxAttempts})...`
    );

    try {
      const chat = (await v0.chats.getById({ chatId })) as ChatDetail;
      const status = chat.latestVersion?.status;

      console.log("[v0-generator] Version status:", status);
      console.log("[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

      if (status === "completed") {
        console.log("[v0-generator] Version is ready!");
        return chat;
      }

      if (status === "failed") {
        console.error("[v0-generator] Version failed:", status);
        return chat; // Return anyway, let caller handle
      }

      // Still generating, wait and retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error("[v0-generator] Error polling version:", error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn("[v0-generator] Max polling attempts reached");
  return null;
}

/**
 * Generate code using v0 Platform API
 * This uses the same API that v0.dev website uses
 */
export async function generateCode(
  prompt: string,
  quality: QualityLevel = "standard",
  categoryType?: string
): Promise<GenerationResult> {
  const modelId = MODEL_MAP[quality];

  // Build the full prompt
  let fullPrompt = "";

  if (categoryType && CATEGORY_PROMPTS[categoryType]) {
    fullPrompt = CATEGORY_PROMPTS[categoryType];
  } else if (prompt) {
    fullPrompt = prompt;
  }

  // Add user's additional instructions if they provided both category and prompt
  if (categoryType && prompt && !prompt.startsWith("Skapa en")) {
    fullPrompt += `\n\nAdditional requirements: ${prompt}`;
  }

  console.log("[v0-generator] Creating chat with v0 Platform API...");
  console.log("[v0-generator] Model:", modelId);
  console.log("[v0-generator] Prompt length:", fullPrompt.length);

  const v0 = getV0Client();

  let chat: ChatDetail;

  try {
    // Use the Platform API to create a chat
    chat = (await v0.chats.create({
      message: fullPrompt,
      system: SYSTEM_PROMPT,
      chatPrivacy: "private",
      modelConfiguration: {
        modelId: modelId as "v0-1.5-md" | "v0-1.5-lg",
        imageGenerations: false,
      },
    })) as ChatDetail;
  } catch (error) {
    console.error("[v0-generator] API Error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (
        error.message.includes("rate limit") ||
        error.message.includes("429")
      ) {
        throw new Error("rate limit exceeded");
      }
      if (
        error.message.includes("unauthorized") ||
        error.message.includes("401")
      ) {
        throw new Error("API key invalid or expired");
      }
      if (error.message.includes("timeout")) {
        throw new Error("Request timed out - please try again");
      }
    }
    throw error;
  }

  console.log("[v0-generator] Chat created:", chat.id);
  console.log("[v0-generator] Version status:", chat.latestVersion?.status);
  console.log("[v0-generator] Files count:", chat.latestVersion?.files?.length);
  console.log("[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

  // Skip polling if we already have files and demoUrl
  const hasContent =
    (chat.latestVersion?.files?.length ?? 0) > 0 && chat.latestVersion?.demoUrl;

  // If version is not ready yet and no content, poll for completion
  // Only poll if status is "pending" (not "completed" or "failed")
  const status = chat.latestVersion?.status;
  if (!hasContent && status !== "completed" && status !== "failed") {
    console.log("[v0-generator] Waiting for version to be ready...");
    const readyChat = await waitForVersionReady(chat.id);
    if (readyChat) {
      chat = readyChat;
    } else {
      console.warn("[v0-generator] Polling timed out, using current response");
    }
  } else if (status === "failed") {
    console.error("[v0-generator] Generation failed");
  } else if (hasContent) {
    console.log("[v0-generator] Already have content, skipping polling");
  }

  // Extract files from the response
  const files: GeneratedFile[] =
    chat.latestVersion?.files?.map((file) => ({
      name: file.name,
      content: file.content,
    })) || [];

  // Build combined code from all files
  let combinedCode = "";
  if (files.length > 0) {
    // Find the main component file (usually page.tsx or the first .tsx file)
    const mainFile =
      files.find(
        (f) =>
          f.name.includes("page.tsx") ||
          f.name.includes("Page.tsx") ||
          f.name.endsWith(".tsx")
      ) || files[0];

    combinedCode = mainFile?.content || "";

    console.log("[v0-generator] Main file:", mainFile?.name);
    console.log("[v0-generator] Code length:", combinedCode.length);
  } else {
    // Fallback: use the text response
    combinedCode = chat.text || "";
    console.log(
      "[v0-generator] Using text fallback, length:",
      combinedCode.length
    );
  }

  console.log(
    "[v0-generator] Generation complete, demoUrl:",
    chat.latestVersion?.demoUrl
  );

  return {
    code: combinedCode,
    files,
    chatId: chat.id,
    demoUrl: chat.latestVersion?.demoUrl,
    screenshotUrl: chat.latestVersion?.screenshotUrl,
    versionId: chat.latestVersion?.id,
    webUrl: chat.webUrl,
    model: modelId,
  };
}

/**
 * Refine existing code based on user instructions
 * Uses the chat session to continue the conversation
 */
export async function refineCode(
  existingChatId: string | null,
  existingCode: string,
  instruction: string,
  quality: QualityLevel = "standard"
): Promise<GenerationResult> {
  const modelId = MODEL_MAP[quality];
  const v0 = getV0Client();

  // If we have an existing chat ID, send a message to that chat
  if (existingChatId) {
    console.log(
      "[v0-generator] Sending refinement to existing chat:",
      existingChatId
    );

    // Send the message
    let chat = (await v0.chats.sendMessage({
      chatId: existingChatId,
      message: instruction,
      modelConfiguration: {
        modelId: modelId as "v0-1.5-md" | "v0-1.5-lg",
      },
    })) as ChatDetail;

    const refineStatus = chat.latestVersion?.status;
    console.log("[v0-generator] Message sent, version status:", refineStatus);

    // If version is not ready yet, poll for completion
    // Only poll if status is "pending" (not "completed" or "failed")
    if (refineStatus !== "completed" && refineStatus !== "failed") {
      const readyChat = await waitForVersionReady(existingChatId);
      if (readyChat) {
        chat = readyChat;
      }
    } else if (refineStatus === "failed") {
      console.error("[v0-generator] Refine generation failed");
    }

    const files: GeneratedFile[] =
      chat.latestVersion?.files?.map((file) => ({
        name: file.name,
        content: file.content,
      })) || [];

    const mainFile =
      files.find(
        (f) =>
          f.name.includes("page.tsx") ||
          f.name.includes("Page.tsx") ||
          f.name.endsWith(".tsx")
      ) || files[0];

    console.log(
      "[v0-generator] Refinement complete, demoUrl:",
      chat.latestVersion?.demoUrl
    );

    return {
      code: mainFile?.content || chat.text || "",
      files,
      chatId: chat.id,
      demoUrl: chat.latestVersion?.demoUrl,
      screenshotUrl: chat.latestVersion?.screenshotUrl,
      versionId: chat.latestVersion?.id,
      webUrl: chat.webUrl,
      model: modelId,
    };
  }

  // If no chat ID, create a new chat with the refinement context
  console.log("[v0-generator] Creating new chat for refinement...");

  const refinementPrompt = `Here is my existing code:

\`\`\`tsx
${existingCode}
\`\`\`

Please modify it according to this instruction: ${instruction}

Keep the same overall structure and only make the requested changes.`;

  return generateCode(refinementPrompt, quality);
}

/**
 * Generate from a v0 community template
 * Uses v0.chats.init() with type: 'template'
 *
 * NOTE: Quality/model parameter is accepted for API consistency,
 * but template initialization just clones existing code - no AI
 * generation happens. Model selection only matters for refinements.
 */
export async function generateFromTemplate(
  templateId: string,
  quality: QualityLevel = "standard"
): Promise<GenerationResult> {
  const model = MODEL_MAP[quality];
  console.log(
    "[v0-generator] Initializing from template:",
    templateId,
    "quality:",
    quality,
    "→",
    model
  );

  const v0 = getV0Client();

  try {
    // Note: model parameter does not apply to template init (just cloning template)
    // Template init only accepts templateId and chatPrivacy
    const chat = (await v0.chats.init({
      type: "template",
      templateId: templateId,
      chatPrivacy: "private",
    })) as ChatDetail;

    console.log("[v0-generator] Template initialized:", chat.id);
    console.log("[v0-generator] Version status:", chat.latestVersion?.status);
    console.log(
      "[v0-generator] Files count:",
      chat.latestVersion?.files?.length
    );

    // Extract files from the response
    const files: GeneratedFile[] =
      chat.latestVersion?.files?.map((file) => ({
        name: file.name,
        content: file.content,
      })) || [];

    // Find the main component file
    const mainFile =
      files.find(
        (f) =>
          f.name.includes("page.tsx") ||
          f.name.includes("Page.tsx") ||
          f.name.endsWith(".tsx")
      ) || files[0];

    return {
      code: mainFile?.content || chat.text || "",
      files,
      chatId: chat.id,
      demoUrl: chat.latestVersion?.demoUrl,
      screenshotUrl: chat.latestVersion?.screenshotUrl,
      versionId: chat.latestVersion?.id,
      webUrl: chat.webUrl,
      model: model, // Return actual model used (even if SDK ignored it for template)
    };
  } catch (error) {
    console.error("[v0-generator] Template init error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error("Template not found");
      }
      if (
        error.message.includes("rate limit") ||
        error.message.includes("429")
      ) {
        throw new Error("rate limit exceeded");
      }
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE PREVIEW (Lightweight - just gets demoUrl + screenshotUrl)
// ═══════════════════════════════════════════════════════════════════════════

export interface TemplatePreviewResult {
  chatId: string;
  demoUrl: string | null;
  screenshotUrl: string | null;
}

/**
 * Initialize a lightweight preview for a v0 template
 * Returns chatId, demoUrl, and screenshotUrl WITHOUT downloading all files
 * Used for gallery preview before user selects the template
 */
export async function initTemplatePreview(
  v0TemplateId: string
): Promise<TemplatePreviewResult> {
  console.log(
    "[v0-generator] Initializing preview for template:",
    v0TemplateId
  );

  const v0 = getV0Client();

  try {
    const chat = (await v0.chats.init({
      type: "template",
      templateId: v0TemplateId,
      chatPrivacy: "private",
    })) as ChatDetail;

    console.log("[v0-generator] Preview initialized:", {
      chatId: chat.id,
      hasDemoUrl: !!chat.latestVersion?.demoUrl,
      hasScreenshot: !!chat.latestVersion?.screenshotUrl,
    });

    return {
      chatId: chat.id,
      demoUrl: chat.latestVersion?.demoUrl ?? null,
      screenshotUrl: chat.latestVersion?.screenshotUrl ?? null,
    };
  } catch (error) {
    console.error("[v0-generator] Preview init error:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error("Template not found");
      }
      if (
        error.message.includes("rate limit") ||
        error.message.includes("429")
      ) {
        throw new Error("Rate limit exceeded");
      }
    }
    throw error;
  }
}

/**
 * Sanitize response to remove v0/Vercel references (white-label)
 */
export function sanitizeCode(code: string): string {
  if (!code) return "";

  let result = code;

  // Remove <Thinking> blocks (keep content outside)
  result = result.replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, "");

  // Remove any other XML-like tags that might wrap the response
  result = result.replace(/<\/?[A-Z][a-zA-Z]*>/g, "");

  // White-label: remove v0/Vercel references
  result = result
    .replace(/v0\.dev/gi, "")
    .replace(/v0\.app/gi, "")
    .replace(/vercel/gi, "")
    .replace(/\/\/ Generated by v0.*\n?/gi, "")
    .replace(/\/\* v0.*\*\/\n?/gi, "")
    .replace(/\s*\/\/ v0.*\n?/gi, "\n");

  return result.trim();
}
