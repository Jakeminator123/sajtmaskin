import { NextRequest, NextResponse } from "next/server";
import { generateFromTemplate } from "@/lib/v0-generator";

// Allow 5 minutes for v0 API responses
export const maxDuration = 300;

// Fun loading messages for template initialization
const loadingMessages = [
  "Laddar template...",
  "Förbereder din design...",
  "Hämtar komponenter...",
  "Optimerar koden...",
];

function getRandomMessage() {
  return loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, quality = "standard" } = body;

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

    console.log(
      "[API /template] Initializing from template:",
      templateId,
      "quality:",
      quality
    );

    // Generate from template using v0 Platform API
    const result = await generateFromTemplate(templateId, quality);

    console.log("[API /template] Result:", {
      hasFiles: !!result.files?.length,
      filesCount: result.files?.length,
      hasChatId: !!result.chatId,
      hasDemoUrl: !!result.demoUrl,
    });

    // Validate that we got useful content
    const hasFiles = result.files && result.files.length > 0;
    const hasDemoUrl = !!result.demoUrl;
    
    if (!hasFiles && !hasDemoUrl) {
      console.error("[API /template] No content received from v0 API");
      return NextResponse.json(
        {
          success: false,
          error: "Mallen kunde inte laddas. v0 API returnerade inget innehåll.",
        },
        { status: 502 }
      );
    }

    // Find the main code file
    let mainCode = "";
    if (hasFiles) {
      const mainFile =
        result.files!.find(
          (f) =>
            f.name.includes("page.tsx") ||
            f.name.includes("Page.tsx") ||
            f.name.endsWith(".tsx")
        ) || result.files![0];
      mainCode = mainFile?.content || "";
    }

    return NextResponse.json({
      success: true,
      message: getRandomMessage(),
      code: mainCode || result.code,
      files: result.files,
      chatId: result.chatId,
      demoUrl: result.demoUrl,
      model: result.model,
    });
  } catch (error) {
    console.error("[API /template] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (errorMessage.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: "Template hittades inte. Välj en annan template.",
        },
        { status: 404 }
      );
    }

    if (errorMessage.includes("rate limit")) {
      return NextResponse.json(
        {
          success: false,
          error: "För många förfrågningar. Vänta en stund och försök igen.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte ladda template. Försök igen.",
      },
      { status: 500 }
    );
  }
}
