import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectData, getProjectById } from "@/lib/data/database";
import OpenAI from "openai";

/**
 * Project Analysis API
 *
 * Analyzes a project and provides:
 * - Code quality assessment
 * - Structure recommendations
 * - Performance suggestions
 * - SEO opportunities
 * - Prioritized improvement list
 *
 * Uses OpenAI Responses API with gpt-4o-mini for cost-efficiency.
 * This is a FREE analysis (no diamond cost) to help users understand their project.
 */

// Allow up to 60 seconds for analysis
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// Analysis system prompt
const ANALYSIS_SYSTEM_PROMPT = `You are an expert web developer and code analyst. 
Analyze the provided project files and give a structured analysis.

RESPOND IN SWEDISH.

OUTPUT FORMAT (use these exact headers):
## 📊 Projektöversikt
[Brief 1-2 sentence summary of what this project is]

## ✅ Styrkor (3-5 punkter)
- [Strength 1]
- [Strength 2]
...

## 🔧 Förbättringsområden (3-5 punkter)
- [Area 1]: [Specific suggestion]
- [Area 2]: [Specific suggestion]
...

## 🚀 Rekommenderade nästa steg
1. [Priority action 1]
2. [Priority action 2]
3. [Priority action 3]

## 💡 Snabbvinster
[1-3 quick wins that would have big impact with minimal effort]

Be constructive, specific, and actionable. Focus on what provides the most value.`;

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    console.log("[Analyze] Starting analysis for project:", projectId);

    // 1. Verify user is authenticated
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    // 2. Get project metadata
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 },
      );
    }

    // 3. Verify ownership
    if (project.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Du kan bara analysera dina egna projekt" },
        { status: 403 },
      );
    }

    // 4. Get project files from project_data
    const projectData = getProjectData(projectId);
    const rawFiles = projectData?.files;

    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga filer hittades i projektet" },
        { status: 404 },
      );
    }

    // Convert v0 file format to simple format
    const files = rawFiles
      .filter(
        (f): f is { name: string; content: string } =>
          f !== null && typeof f === "object" && "name" in f && "content" in f,
      )
      .map((f) => ({ path: f.name, content: f.content }));

    console.log("[Analyze] Found", files.length, "files");

    // 5. Build file context for analysis
    // Prioritize important files and limit total size
    const priorityFiles = [
      "package.json",
      "app/page.tsx",
      "app/layout.tsx",
      "src/app/page.tsx",
      "src/app/layout.tsx",
      "components/",
      "lib/",
    ];

    let fileContext = "";
    let totalChars = 0;
    const MAX_CHARS = 30000; // ~7500 tokens

    // First, add priority files
    for (const file of files) {
      if (totalChars >= MAX_CHARS) break;

      const isPriority = priorityFiles.some((p) => file.path.includes(p) || file.path.endsWith(p));

      if (isPriority) {
        const content = file.content.substring(0, 3000); // Max 3000 chars per file
        fileContext += `\n### ${file.path}\n\`\`\`\n${content}\n\`\`\`\n`;
        totalChars += content.length + file.path.length + 20;
      }
    }

    // Then add remaining files if space allows
    for (const file of files) {
      if (totalChars >= MAX_CHARS) break;

      const isPriority = priorityFiles.some((p) => file.path.includes(p) || file.path.endsWith(p));

      if (!isPriority && (file.path.endsWith(".tsx") || file.path.endsWith(".ts"))) {
        const content = file.content.substring(0, 2000);
        fileContext += `\n### ${file.path}\n\`\`\`\n${content}\n\`\`\`\n`;
        totalChars += content.length + file.path.length + 20;
      }
    }

    // 6. Create analysis prompt
    const analysisPrompt = `Analysera detta webbprojekt:

Projektnamn: ${project.name || "Okänt"}
Antal filer: ${files.length}
Filtyper: ${[...new Set(files.map((f) => f.path.split(".").pop()))].join(", ")}

FILER:
${fileContext}

Ge en strukturerad analys enligt formatet.`;

    console.log("[Analyze] Sending to OpenAI, context length:", totalChars);

    // 7. Call OpenAI Responses API
    const response = await getOpenAIClient().responses.create({
      model: "gpt-4o-mini",
      instructions: ANALYSIS_SYSTEM_PROMPT,
      input: analysisPrompt,
      store: false, // Don't store analysis for privacy
    });

    // Extract text from response
    const messageItem = response.output.find(
      (item): item is OpenAI.Responses.ResponseOutputMessage => item.type === "message",
    );

    const analysis =
      messageItem?.content
        .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === "output_text")
        .map((c) => c.text)
        .join("\n") || "Kunde inte generera analys.";

    console.log("[Analyze] Analysis completed, length:", analysis.length);

    return NextResponse.json({
      success: true,
      analysis,
      filesAnalyzed: files.length,
      tokensUsed: response.usage?.total_tokens,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Analyze] Error:", error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
