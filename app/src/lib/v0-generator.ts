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
const CATEGORY_PROMPTS: Record<string, string> = {
  "landing-page": `Create a modern, professional landing page with:
- Hero section with headline and CTA button
- Features/benefits grid (3-4 items)
- Social proof section (testimonials or logos)
- Pricing table with 3 tiers
- FAQ section
- Contact/signup form
- Footer with links
Use a dark theme with blue accents. Make it fully responsive.`,

  website: `Create a complete multi-page website structure with:
- Home page with hero and key sections
- About page content
- Services/products page
- Contact page with form
- Consistent header and footer across all pages
Use a professional design. Include navigation between pages.`,

  dashboard: `Create an admin dashboard with:
- Sidebar navigation with icons
- Top header with user menu and notifications
- Main content area with metric cards (4 cards)
- Data table with sample data
- Charts section (line or bar chart placeholder)
- Dark theme preferred
Make it fully responsive with collapsible sidebar on mobile.`,
};

// System prompt for v0 to generate better code
const SYSTEM_PROMPT = `You are an expert React and Next.js developer. Generate clean, production-ready React components using:
- React functional components with TypeScript
- Tailwind CSS for all styling (no external CSS files)
- Lucide React for icons
- Modern best practices and accessibility
- Fully responsive design
- Proper component structure`;

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
  maxAttempts = 60, // 60 × 5s = 5 minutes timeout
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
    // Note: model parameter may not apply to template init (just cloning)
    // but we include it for future compatibility
    const chat = (await v0.chats.init({
      type: "template",
      templateId: templateId,
      model: model, // May be ignored by SDK for template init
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
