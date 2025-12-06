import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectFiles } from "@/lib/redis";
import { generateCode } from "@/lib/v0-generator";

// Allow up to 2 minutes for v0 preview generation
export const maxDuration = 120;

/**
 * POST /api/projects/[id]/preview
 *
 * Regenerates a live preview for an AI Studio project by sending
 * the current project files to v0 API and getting a new demoUrl.
 *
 * This allows users to see live preview after AI edits their code.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Validate user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 }
      );
    }

    // Get project files from Redis
    const files = await getProjectFiles(projectId);
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga filer hittades i projektet" },
        { status: 404 }
      );
    }

    console.log(
      `[Preview] Regenerating preview for project ${projectId} with ${files.length} files`
    );

    // Build a prompt with all the project files
    const fileContents = files
      .filter(
        (f) =>
          f.path.endsWith(".tsx") ||
          f.path.endsWith(".ts") ||
          f.path.endsWith(".css")
      )
      .slice(0, 10) // Limit to 10 files to avoid context overflow
      .map((f) => `// File: ${f.path}\n${f.content}`)
      .join("\n\n---\n\n");

    // Find the main page component
    const mainPage = files.find(
      (f) =>
        f.path.includes("page.tsx") ||
        f.path.includes("Page.tsx") ||
        f.path === "app/page.tsx"
    );

    const prompt = `Render this existing Next.js/React application exactly as it is. Do not modify the code, just display it.

${
  mainPage ? `Main page component:\n\`\`\`tsx\n${mainPage.content}\n\`\`\`` : ""
}

${fileContents ? `Other files:\n${fileContents}` : ""}

Important: Render the application exactly as provided without any modifications.`;

    // Call v0 to generate preview
    const result = await generateCode(prompt, "standard");

    if (!result.demoUrl) {
      return NextResponse.json(
        { success: false, error: "Kunde inte generera preview" },
        { status: 500 }
      );
    }

    console.log(`[Preview] Generated new demoUrl: ${result.demoUrl}`);

    return NextResponse.json({
      success: true,
      demoUrl: result.demoUrl,
      chatId: result.chatId,
    });
  } catch (error) {
    console.error("[Preview] Error:", error);
    const message = error instanceof Error ? error.message : "Okänt fel";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
