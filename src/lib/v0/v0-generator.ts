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
 * MODELLER (3 tiers):
 * - v0-mini: Light (snabbast, billigast)
 * - v0-pro: Balanced (bra kvalitet till rimlig kostnad)
 * - v0-max: Best (högsta kvalitet, långsammare/dyrare)
 *
 * All operations include error handling and structured logging.
 */

import { createClient, type ChatDetail } from "v0-sdk";
import {
  enhancePromptForV0,
  type MediaLibraryItem,
} from "@/lib/utils/prompt-utils";
import { debugLog, logFinalPrompt } from "@/lib/utils/debug";
import { logV0 } from "@/lib/utils/file-logger";
import { SECRETS } from "@/lib/config";
import { SYSTEM_PROMPT } from "@/lib/v0/systemPrompt";

// Lazy-initialized v0 client (created at request time, not import time)
let _v0Client: ReturnType<typeof createClient> | null = null;

function getV0Client() {
  if (!_v0Client) {
    const apiKey = SECRETS.v0ApiKey;
    if (!apiKey) {
      throw new Error("V0_API_KEY environment variable is not set");
    }
    // Note: v0-sdk doesn't support timeout config
    // Long-running operations (5+ min) may timeout at HTTP level
    // maxDuration in route.ts is set to 600s to help
    _v0Client = createClient({
      apiKey,
    });
  }
  return _v0Client;
}

// Local type to avoid dependency on removed api-client
export type QualityLevel = "light" | "standard" | "pro" | "premium" | "max";

/**
 * Generated file structure from v0 API
 */
export interface GeneratedFile {
  name: string;
  content: string;
}

/**
 * Find the main component file from a list of generated files.
 * v0 generates multiple files (components, utils, styles) but we need to identify
 * the "main" file for display purposes. Priority order:
 * 1. page.tsx (Next.js app router convention)
 * 2. Page.tsx (capitalized variant)
 * 3. Any .tsx file (React component)
 * 4. First file in the list (fallback)
 *
 * @param files - Array of generated files from v0
 * @returns The main file, or undefined if no files
 */
export function findMainFile(
  files: GeneratedFile[]
): GeneratedFile | undefined {
  if (!files || files.length === 0) return undefined;

  return (
    files.find(
      (f) =>
        f.name.includes("page.tsx") ||
        f.name.includes("Page.tsx") ||
        f.name.endsWith(".tsx")
    ) || files[0]
  );
}

/**
 * v0 Model Configuration
 * ======================
 *
 * Available v0 models (Platform API):
 * - v0-mini
 * - v0-pro
 * - v0-max
 *
 * Quality levels (aliases):
 * - light: v0-mini
 * - standard / pro: v0-pro
 * - premium / max: v0-max
 */
export type V0ModelId = "v0-mini" | "v0-pro" | "v0-max";

const MODEL_MAP: Record<QualityLevel, V0ModelId> = {
  light: "v0-mini",
  standard: "v0-pro",
  pro: "v0-pro",
  premium: "v0-max",
  max: "v0-max",
};

type V0SdkCreateRequest = Parameters<
  ReturnType<typeof createClient>["chats"]["create"]
>[0];

type V0SdkModelId = NonNullable<
  V0SdkCreateRequest["modelConfiguration"]
>["modelId"];

function toSdkModelId(modelId: V0ModelId): V0SdkModelId {
  // v0-sdk types can lag behind model ids; cast keeps runtime values intact.
  return modelId as unknown as V0SdkModelId;
}

/**
 * Extended model type for future use
 */
/**
 * Category-specific prompts for initial generation
 * ═══════════════════════════════════════════════════════════════
 *
 * WHEN THESE ARE USED:
 * - When categoryType is provided to generateCode()
 * - ONLY for NEW generation (not refinement)
 * - BEFORE orchestrator enhancement (if orchestrator is used)
 *
 * HOW IT WORKS:
 * 1. If categoryType matches a key in CATEGORY_PROMPTS:
 *    - The category prompt REPLACES the user prompt entirely
 *    - This ensures consistent, high-quality templates for each category
 *
 * 2. If categoryType exists but no match:
 *    - User prompt is used as-is
 *    - categoryType is passed to v0 API as metadata
 *
 * 3. Interaction with Orchestrator:
 *    - Orchestrator runs BEFORE v0 generation
 *    - If orchestrator enhances the prompt, the enhanced prompt is used
 *    - Category prompts are NOT enhanced by orchestrator (they're already optimized)
 *
 * NOTE: These prompts are detailed, production-ready templates that guide v0
 * to generate high-quality, consistent code for specific website types.
 */
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

// GeneratedFile interface is defined at the top of this file

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
 * Streaming callback for real-time generation updates
 * Called with partial content as v0 generates
 */
export type StreamingCallback = (chunk: {
  type: "text" | "file" | "status" | "thinking";
  content: string;
  fileName?: string;
}) => void;

/**
 * Check if v0 streaming is enabled via feature toggle
 * Streaming shows generation progress in real-time
 */
export function isV0StreamingEnabled(): boolean {
  return true;
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
  maxAttempts = 45, // 45 × 4s = 3 minutes (increased for complex refines)
  delayMs = 4000 // 4 seconds between polls
): Promise<ChatDetail | null> {
  const v0 = getV0Client();
  let consecutiveUndefined = 0;
  const maxConsecutiveUndefined = 5; // Give up after 5 consecutive undefined responses

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[v0-generator] Polling version status (attempt ${attempt}/${maxAttempts})...`
    );

    try {
      const rawChat = await v0.chats.getById({ chatId });

      // Debug: Log the raw response from getById on first attempt
      if (attempt === 1) {
        console.log(
          "[v0-generator] getById raw keys:",
          Object.keys(rawChat || {})
        );
        console.log(
          "[v0-generator] getById raw:",
          JSON.stringify(rawChat, null, 2).substring(0, 2000)
        );
      }

      const chat = rawChat as ChatDetail | null;
      if (!chat) {
        console.error("[v0-generator] Chat not found:", chatId);
        return null;
      }
      const status = chat.latestVersion?.status;

      debugLog("v0", "[v0-generator] Version status:", status);
      debugLog("v0", "[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

      // If status is undefined, track consecutive failures
      if (status === undefined) {
        consecutiveUndefined++;
        console.warn(
          `[v0-generator] Status undefined (${consecutiveUndefined}/${maxConsecutiveUndefined})`
        );

        // Give up if too many undefined responses - likely a problem with the chat
        if (consecutiveUndefined >= maxConsecutiveUndefined) {
          console.error(
            "[v0-generator] Too many undefined responses, giving up"
          );
          return null;
        }
      } else {
        consecutiveUndefined = 0; // Reset counter on valid response
      }

      if (status === "completed") {
        debugLog("v0", "[v0-generator] Version is ready!");
        return chat;
      }

      if (status === "failed") {
        console.error("[v0-generator] Version failed:", status);
        return chat; // Return anyway, let caller handle
      }

      // Still generating (pending or undefined), wait and retry
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
 * Options for code generation
 */
export interface GenerateCodeOptions {
  /** Quality level (light/standard/pro/premium/max) */
  quality?: QualityLevel;
  /** Category type for pre-built prompts */
  categoryType?: string;
  /** Image URLs to use as reference/inspiration */
  attachments?: Array<{ url: string }>;
  /** Enable image generation in the output */
  imageGenerations?: boolean;
  /** Media library items (for image references in prompts) */
  mediaLibrary?: MediaLibraryItem[];
  /** Callback for streaming updates (if v0Streaming feature is enabled) */
  onStream?: StreamingCallback;
}

/**
 * Generate code using v0 Platform API
 * This uses the same API that v0.dev website uses
 *
 * @param prompt - User's description of what to build
 * @param options - Generation options including quality, category, and attachments
 */
export async function generateCode(
  prompt: string,
  qualityOrOptions: QualityLevel | GenerateCodeOptions = "standard",
  categoryType?: string // Legacy parameter - use options.categoryType instead
): Promise<GenerationResult> {
  // Support both old signature and new options object
  const options: GenerateCodeOptions =
    typeof qualityOrOptions === "string"
      ? { quality: qualityOrOptions, categoryType: categoryType || undefined }
      : qualityOrOptions;

  // Ensure categoryType from options takes precedence
  if (
    options.categoryType &&
    categoryType &&
    options.categoryType !== categoryType
  ) {
    console.warn(
      "[v0-generator] categoryType mismatch - using options.categoryType:",
      options.categoryType
    );
  }

  const quality = options.quality || "standard";
  const modelId = MODEL_MAP[quality];

  // Build the full prompt
  let fullPrompt = "";

  // Check if prompt is already expanded (from Creative Brief Enhancer or orchestrator)
  // Expanded prompts contain detailed structure like "hero section", "navigation", etc.
  const isAlreadyExpanded =
    prompt.includes("hero section") ||
    prompt.includes("navigation") ||
    prompt.startsWith("Create a") ||
    prompt.startsWith("Build a") ||
    prompt.includes("USER REQUEST:") ||
    prompt.includes("ORIGINAL REQUEST:");

  // Use category prompt if available
  // IMPROVED: If prompt is already expanded, merge instead of replacing
  if (options.categoryType && CATEGORY_PROMPTS[options.categoryType]) {
    if (isAlreadyExpanded) {
      // Merge: Use category prompt as BASE, but preserve user's expanded details
      // This ensures we don't lose Creative Brief Enhancer's work
      fullPrompt = `${
        CATEGORY_PROMPTS[options.categoryType]
      }\n\nUSER-SPECIFIC REQUIREMENTS:\n${prompt}`;
      debugLog(
        "v0",
        "[v0-generator] Merging category prompt with expanded user prompt"
      );
    } else {
      // Original behavior: Replace with category prompt
      fullPrompt = CATEGORY_PROMPTS[options.categoryType];
      // Add user's additional instructions if they provided both category and prompt
      // Only add if prompt doesn't already contain category-like content
      if (prompt && prompt.trim().length > 0) {
        const promptLower = prompt.toLowerCase();
        const categoryKeywords = [
          "skapa en",
          "bygg en",
          "gör en",
          "designa en",
        ];
        const isCategoryLikePrompt = categoryKeywords.some((keyword) =>
          promptLower.startsWith(keyword)
        );

        if (!isCategoryLikePrompt) {
          fullPrompt += `\n\nAdditional requirements: ${prompt}`;
        }
      }
    }
  } else if (prompt) {
    fullPrompt = prompt;
  }

  // Apply media enhancement (add media library URLs if available)
  // This ensures mediabibliotek images are included in the prompt
  if (options.mediaLibrary && options.mediaLibrary.length > 0) {
    fullPrompt = enhancePromptForV0(fullPrompt, options.mediaLibrary);
    debugLog(
      "v0",
      `[v0-generator] Added ${options.mediaLibrary.length} media library items to prompt`
    );
  }

  debugLog("v0", "[v0-generator] Creating chat with v0 Platform API...");
  debugLog("v0", "[v0-generator] Model:", modelId);
  debugLog("v0", "[v0-generator] Prompt length:", fullPrompt.length);

  // Check if streaming is enabled via feature toggle
  const useStreaming = isV0StreamingEnabled() && !!options.onStream;
  if (useStreaming) {
    console.log("[v0-generator] Streaming mode ENABLED (v0Streaming feature)");
  }

  // Log the complete final prompt in magenta for visibility
  logFinalPrompt(fullPrompt, modelId);

  // Log to file for debugging
  logV0({
    event: "generate",
    model: modelId,
    promptLength: fullPrompt.length,
    promptSnippet: fullPrompt.substring(0, 200),
    hasStreaming: useStreaming,
    categoryType: options.categoryType,
  });

  const v0 = getV0Client();

  let chat: ChatDetail;

  try {
    // Use the Platform API to create a chat
    // Build create request with optional attachments
    const createRequest: V0SdkCreateRequest = {
      message: fullPrompt,
      system: SYSTEM_PROMPT,
      chatPrivacy: "private",
      modelConfiguration: {
        modelId: toSdkModelId(modelId),
        imageGenerations: options.imageGenerations ?? false,
        // Enable thinking for better reasoning (premium gets more detailed thinking)
        thinking: modelId === "v0-max",
      },
      // Use streaming mode if enabled, otherwise sync for full ChatDetail response
      responseMode: useStreaming ? undefined : "sync",
    };

    // Add attachments if provided (screenshots, figma designs, etc.)
    if (options.attachments && options.attachments.length > 0) {
      createRequest.attachments = options.attachments;
      console.log(
        "[v0-generator] Including",
        options.attachments.length,
        "attachments"
      );
    }

    const rawResponse = await v0.chats.create(createRequest);

    // Handle streaming response if enabled
    if (useStreaming && options.onStream) {
      // Notify that generation has started
      options.onStream({
        type: "status",
        content: "Generering startad...",
      });
    }

    // Debug: Log the raw response structure
    console.log(
      "[v0-generator] Raw response keys:",
      Object.keys(rawResponse || {})
    );
    const rawPreview = JSON.stringify(rawResponse, null, 2);
    const sanitizedPreview = rawPreview
      // Truncate JSON fields that contain raw base64
      .replace(
        /("base64"\s*:\s*")([A-Za-z0-9+/=]{20,})(")/g,
        (_m, start, b64, end) =>
          `${start}${String(b64).slice(0, 10)}...(base64 förkortad, längd=${
            String(b64).length
          })${end}`
      )
      // Truncate data URLs that contain base64
      .replace(
        /(data:image\/[a-zA-Z0-9.+-]+;base64,)([A-Za-z0-9+/=]{20,})/g,
        (_m, prefix, b64) =>
          `${prefix}${String(b64).slice(0, 10)}...(base64 förkortad, längd=${
            String(b64).length
          })`
      );
    console.log(
      "[v0-generator] Raw response:",
      sanitizedPreview.substring(0, 2000)
    );

    chat = rawResponse as ChatDetail;
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

  debugLog("v0", "[v0-generator] Chat created:", chat.id);
  debugLog("v0", "[v0-generator] Version status:", chat.latestVersion?.status);
  debugLog(
    "v0",
    "[v0-generator] Files count:",
    chat.latestVersion?.files?.length
  );
  debugLog("v0", "[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

  // Check if we have complete content (both files AND demoUrl are required)
  const hasFiles = (chat.latestVersion?.files?.length ?? 0) > 0;
  const hasDemoUrl = !!chat.latestVersion?.demoUrl;
  const hasCompleteContent = hasFiles && hasDemoUrl;

  // If version is not ready yet and content is incomplete, poll for completion
  // Only poll if status is "pending" (not "completed" or "failed")
  const status = chat.latestVersion?.status;
  if (!hasCompleteContent && status !== "completed" && status !== "failed") {
    debugLog("v0", "[v0-generator] Waiting for version to be ready...");
    const readyChat = await waitForVersionReady(chat.id);
    if (readyChat) {
      chat = readyChat;
    } else {
      console.warn("[v0-generator] Polling timed out, using current response");
    }
  } else if (status === "failed") {
    console.error("[v0-generator] Generation failed");
  } else if (hasCompleteContent) {
    console.log(
      "[v0-generator] Already have complete content, skipping polling"
    );
  }

  // Extract files from the response
  const files: GeneratedFile[] =
    chat.latestVersion?.files?.map((file) => ({
      name: file.name,
      content: file.content,
    })) || [];

  // Build combined code from all files
  // Uses findMainFile() helper to identify the primary component (page.tsx priority)
  let combinedCode = "";
  const mainFile = findMainFile(files);

  if (mainFile) {
    combinedCode = mainFile.content || "";
    debugLog("v0", "[v0-generator] Main file:", mainFile.name);
    debugLog("v0", "[v0-generator] Code length:", combinedCode.length);
  } else {
    // Fallback: use the text response if no files were generated
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
  quality: QualityLevel = "standard",
  mediaLibrary?: MediaLibraryItem[]
): Promise<GenerationResult> {
  const modelId = MODEL_MAP[quality];
  const v0 = getV0Client();

  // Apply media enhancement once to avoid double-wrapping further up the stack
  const instructionWithMedia = enhancePromptForV0(
    instruction,
    mediaLibrary && mediaLibrary.length > 0 ? mediaLibrary : undefined
  );

  // If we have an existing chat ID, send a message to that chat
  if (existingChatId) {
    console.log(
      "[v0-generator] Sending refinement to existing chat:",
      existingChatId
    );

    // Get current chat state to compare before/after
    let previousDemoUrl: string | undefined;
    let previousVersionId: string | undefined;
    try {
      const previousChat = await v0.chats.getById({ chatId: existingChatId });
      previousDemoUrl = (previousChat as ChatDetail)?.latestVersion?.demoUrl;
      previousVersionId = (previousChat as ChatDetail)?.latestVersion?.id;
      debugLog("v0", "[v0-generator] Previous demoUrl:", previousDemoUrl);
      debugLog("v0", "[v0-generator] Previous versionId:", previousVersionId);
    } catch (err) {
      console.warn("[v0-generator] Could not fetch previous chat state:", err);
    }

    // Simple refinement instruction - V0 has chat history and understands context
    // No need to repeat rules every time
    const refinementInstruction = instructionWithMedia;

    // Log the complete refinement prompt in magenta for visibility
    logFinalPrompt(refinementInstruction, modelId);

    // Log to file for debugging
    logV0({
      event: "refine",
      model: modelId,
      promptLength: refinementInstruction.length,
      promptSnippet: refinementInstruction.substring(0, 200),
      chatId: existingChatId,
    });

    // Send the message
    // IMPORTANT: Must use responseMode: 'sync' to get full ChatDetail response
    let chat = (await v0.chats.sendMessage({
      chatId: existingChatId,
      message: refinementInstruction,
      modelConfiguration: {
        modelId: toSdkModelId(modelId),
      },
      responseMode: "sync", // Force synchronous response
    })) as ChatDetail;

    const refineStatus = chat.latestVersion?.status;
    debugLog(
      "v0",
      "[v0-generator] Message sent, version status:",
      refineStatus
    );

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

    const mainFile = findMainFile(files);

    const newDemoUrl = chat.latestVersion?.demoUrl;
    const newVersionId = chat.latestVersion?.id;

    // ENHANCED LOGGING: Show detailed result info
    console.log(
      "[v0-generator] ═══════════════════════════════════════════════════"
    );
    debugLog("v0", "[v0-generator] REFINEMENT COMPLETE:");
    debugLog("v0", "[v0-generator]   → New demoUrl:", newDemoUrl);
    debugLog("v0", "[v0-generator]   → New versionId:", newVersionId);
    debugLog("v0", "[v0-generator]   → Status:", chat.latestVersion?.status);
    debugLog("v0", "[v0-generator]   → Total files:", files.length);
    console.log(
      "[v0-generator] ───────────────────────────────────────────────────"
    );
    console.log(
      "[v0-generator] MAIN FILE SELECTED:",
      mainFile?.name || "(none)"
    );
    console.log(
      "[v0-generator] Main file content length:",
      mainFile?.content?.length || 0,
      "chars"
    );
    console.log(
      "[v0-generator] ───────────────────────────────────────────────────"
    );
    debugLog("v0", "[v0-generator] ALL FILES RETURNED:");
    files.slice(0, 15).forEach((file, i) => {
      const isMain = file.name === mainFile?.name ? " ← MAIN" : "";
      console.log(
        `[v0-generator]   ${i + 1}. ${file.name} (${
          file.content?.length || 0
        } chars)${isMain}`
      );
    });
    if (files.length > 15) {
      console.log(`[v0-generator]   ... and ${files.length - 15} more files`);
    }
    console.log(
      "[v0-generator] ═══════════════════════════════════════════════════"
    );

    // Check if demoUrl changed (important for debugging cache issues)
    if (previousDemoUrl && newDemoUrl === previousDemoUrl) {
      console.warn(
        "[v0-generator] ⚠️  WARNING: demoUrl did not change after refine!"
      );
      console.warn(
        "  This might indicate v0 returned cached version or refine failed"
      );
    } else if (previousDemoUrl && newDemoUrl) {
      console.log(
        "[v0-generator] ✓ demoUrl changed successfully (version updated)"
      );
    }

    if (previousVersionId && newVersionId === previousVersionId) {
      console.warn(
        "[v0-generator] ⚠️  WARNING: versionId did not change after refine!"
      );
    }

    return {
      code: mainFile?.content || chat.text || "",
      files,
      chatId: chat.id,
      demoUrl: newDemoUrl,
      screenshotUrl: chat.latestVersion?.screenshotUrl,
      versionId: newVersionId,
      webUrl: chat.webUrl,
      model: modelId,
    };
  }

  // If no chat ID, create a new chat with the refinement context
  console.log(
    "[v0-generator] No chatId provided, creating new chat for refinement..."
  );

  // Simpler refinement prompt - include code context but skip verbose rules
  const refinementPrompt = `Refine this existing code:

\`\`\`tsx
${existingCode.substring(0, 50000)}${
    existingCode.length > 50000 ? "\n... [truncated]" : ""
  }
\`\`\`

${instructionWithMedia}

Keep the overall structure, just apply the requested changes.`;

  return generateCode(refinementPrompt, quality);
}

/**
 * Generate from a v0 community template
 * Uses v0.chats.init() with type: 'template'
 *
 * NOTE: Quality/model parameter is accepted for API consistency,
 * but template initialization just clones existing code - no AI
 * generation happens. Model selection only matters for refinements.
 *
 * Includes automatic retry for transient errors (500, 502, 503, 504).
 */
export async function generateFromTemplate(
  templateId: string,
  quality: QualityLevel = "standard",
  maxRetries: number = 2
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
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `[v0-generator] Retry attempt ${attempt}/${maxRetries + 1}...`
        );
        // Wait before retry (exponential backoff: 2s, 4s)
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
      // Note: model parameter does not apply to template init (just cloning template)
      // Template init only accepts templateId and chatPrivacy
      const chat = (await v0.chats.init({
        type: "template",
        templateId: templateId,
        chatPrivacy: "private",
      })) as ChatDetail;

      debugLog("v0", "[v0-generator] Template initialized:", chat.id);
      debugLog(
        "v0",
        "[v0-generator] Version status:",
        chat.latestVersion?.status
      );
      console.log(
        "[v0-generator] Files count:",
        chat.latestVersion?.files?.length
      );
      debugLog("v0", "[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

      // Check if template loading failed (status check)
      const status = chat.latestVersion?.status;
      if (status === "failed") {
        console.error(
          "[v0-generator] Template loading failed with status: failed"
        );
        throw new Error("Template loading failed - status was 'failed'");
      }

      // Extract files from the response
      const files: GeneratedFile[] =
        chat.latestVersion?.files?.map((file) => ({
          name: file.name,
          content: file.content,
        })) || [];

      // Find main file using helper (prioritizes page.tsx)
      const mainFile = findMainFile(files);

      // Warn if no content was returned (but don't throw - demoUrl might still work)
      if (files.length === 0 && !chat.latestVersion?.demoUrl) {
        console.warn(
          "[v0-generator] Template returned no files and no demoUrl"
        );
      }

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
      console.error(
        `[v0-generator] Template init error (attempt ${attempt}):`,
        error
      );
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable (transient server errors)
      const msg = lastError.message.toLowerCase();
      const isRetryable =
        msg.includes("500") ||
        msg.includes("internal_server_error") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        msg.includes("timed out");

      // Non-retryable errors - throw immediately
      if (!isRetryable) {
        if (msg.includes("not found") || msg.includes("404")) {
          throw new Error("Template not found - kontrollera template ID");
        }
        if (msg.includes("rate limit") || msg.includes("429")) {
          throw new Error("Rate limit - för många anrop, vänta en stund");
        }
        if (msg.includes("unauthorized") || msg.includes("401")) {
          throw new Error("API-nyckel saknas eller är ogiltig");
        }
        throw new Error(`v0 API-fel: ${lastError.message}`);
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries + 1) {
        console.error("[v0-generator] All retry attempts failed");
        if (msg.includes("500") || msg.includes("internal_server_error")) {
          throw new Error(
            "v0 API har tillfälliga problem. Prova igen om en stund."
          );
        }
        if (msg.includes("502") || msg.includes("503") || msg.includes("504")) {
          throw new Error("v0 API är tillfälligt otillgänglig. Prova igen.");
        }
        throw new Error("Timeout - v0 API svarade inte i tid");
      }

      // Continue to next retry attempt
      debugLog("v0", "[v0-generator] Will retry due to transient error...");
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error("Unknown error in template generation");
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY INITIALIZATION (shadcn blocks, custom registries)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize from a shadcn/v0 registry URL
 * Uses v0.chats.init() with type: 'registry'
 *
 * Registry URLs can be:
 * - https://ui.shadcn.com/r/{component}.json
 * - Custom registry URLs following shadcn registry spec
 * - Component registry items with dependencies
 *
 * @param registryUrl - Full URL to registry item JSON
 * @param options - Optional configuration
 */
export async function initFromRegistry(
  registryUrl: string,
  options: {
    quality?: QualityLevel;
    name?: string;
    maxRetries?: number;
  } = {}
): Promise<GenerationResult> {
  const { quality = "standard", name, maxRetries = 2 } = options;
  const model = MODEL_MAP[quality];

  console.log(
    "[v0-generator] Initializing from registry:",
    registryUrl,
    "quality:",
    quality,
    "→",
    model
  );

  const v0 = getV0Client();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `[v0-generator] Registry retry attempt ${attempt}/${
            maxRetries + 1
          }...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }

      // Initialize chat from registry URL
      const chat = (await v0.chats.init({
        type: "registry",
        registry: { url: registryUrl },
        chatPrivacy: "private",
        name:
          name || `Registry: ${new URL(registryUrl).pathname.split("/").pop()}`,
      })) as ChatDetail;

      debugLog("v0", "[v0-generator] Registry initialized:", chat.id);
      debugLog(
        "v0",
        "[v0-generator] Version status:",
        chat.latestVersion?.status
      );
      console.log(
        "[v0-generator] Files count:",
        chat.latestVersion?.files?.length
      );
      debugLog("v0", "[v0-generator] demoUrl:", chat.latestVersion?.demoUrl);

      // Check if initialization failed
      const status = chat.latestVersion?.status;
      if (status === "failed") {
        console.error(
          "[v0-generator] Registry loading failed with status: failed"
        );
        throw new Error("Registry loading failed - status was 'failed'");
      }

      // Extract files from the response
      const files: GeneratedFile[] =
        chat.latestVersion?.files?.map((file) => ({
          name: file.name,
          content: file.content,
        })) || [];

      // Find main file using helper
      const mainFile = findMainFile(files);

      if (files.length === 0 && !chat.latestVersion?.demoUrl) {
        console.warn(
          "[v0-generator] Registry returned no files and no demoUrl"
        );
      }

      return {
        code: mainFile?.content || chat.text || "",
        files,
        chatId: chat.id,
        demoUrl: chat.latestVersion?.demoUrl,
        screenshotUrl: chat.latestVersion?.screenshotUrl,
        versionId: chat.latestVersion?.id,
        webUrl: chat.webUrl,
        model,
      };
    } catch (error) {
      console.error(
        `[v0-generator] Registry init error (attempt ${attempt}):`,
        error
      );
      lastError =
        error instanceof Error ? error : new Error("Unknown registry error");

      // Check for transient errors that should be retried
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("timeout")
      ) {
        if (attempt <= maxRetries) {
          debugLog("v0", "[v0-generator] Will retry due to transient error...");
          continue;
        }
      }

      // Don't retry for other errors
      throw lastError;
    }
  }

  throw lastError || new Error("Unknown error in registry initialization");
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

    debugLog("v0", "[v0-generator] Preview initialized:", {
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
