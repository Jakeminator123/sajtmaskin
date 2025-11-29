// v0 API Generator using v0-sdk Platform API
// This module handles all communication with v0 API from the backend

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
Use a dark theme with blue accents. Make it fully responsive.`,

  website: `Create a complete multi-page website structure with:
- Home page with hero and key sections
- About page content
- Services/products page
- Contact page with form
- Consistent header and footer across all pages
Use a professional design. Include navigation between pages.`,

  "apps-games": `Create an interactive web application or game with:
- Engaging visual interface
- Interactive elements and user controls
- Clear feedback on user actions
- Game mechanics or app functionality
- Score/progress tracking if applicable
Make it fun and engaging. Use animations where appropriate.`,

  dashboard: `Create an admin dashboard with:
- Sidebar navigation with icons
- Top header with user menu and notifications
- Main content area with metric cards (4 cards)
- Data table with sample data
- Charts section (line or bar chart placeholder)
- Dark theme preferred
Make it fully responsive with collapsible sidebar on mobile.`,

  ecommerce: `Create an e-commerce storefront with:
- Header with logo, search bar, cart icon
- Category navigation
- Product grid with images, prices, ratings (6-8 products)
- Filter sidebar (price, category)
- Product quick-view capability
- Footer with links and newsletter signup
Make it fully responsive.`,

  "blog-portfolio": `Create a blog or portfolio website with:
- Header with logo and navigation
- Hero section with name/title
- Featured content section
- Grid of articles/projects with thumbnails
- About section
- Contact form
- Footer
Use a clean, readable design. Make it fully responsive.`,

  components: `Create a reusable UI component with:
- Clean, modern design
- Proper accessibility (ARIA attributes)
- Hover and focus states
- Animation/transitions
- Multiple variants if applicable
Make it production-ready and easy to customize.`,

  "login-signup": `Create an authentication page with:
- Clean login form with email/password fields
- Social login buttons (Google, GitHub, etc.)
- Registration form option
- Password recovery link
- Remember me checkbox
- Form validation
Use a modern, secure-looking design.`,

  animations: `Create an animated component with:
- Smooth, modern animations
- CSS transitions or Framer Motion
- Interactive hover effects
- Entrance/exit animations
- Attention-grabbing but not distracting
Focus on polish and micro-interactions.`,
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
  model: string;
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

  return {
    code: combinedCode,
    files,
    chatId: chat.id,
    demoUrl: chat.latestVersion?.demoUrl,
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

    const chat = (await v0.chats.sendMessage({
      chatId: existingChatId,
      message: instruction,
      modelConfiguration: {
        modelId: modelId as "v0-1.5-md" | "v0-1.5-lg",
      },
    })) as ChatDetail;

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

    return {
      code: mainFile?.content || chat.text || "",
      files,
      chatId: chat.id,
      demoUrl: chat.latestVersion?.demoUrl,
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
 */
export async function generateFromTemplate(
  templateId: string
): Promise<GenerationResult> {
  console.log("[v0-generator] Initializing from template:", templateId);

  const v0 = getV0Client();

  try {
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
      model: "template",
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
