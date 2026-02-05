import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL, getRecentPromptLogs } from "@/lib/db/services";

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

    const rows = await getRecentPromptLogs(limit);
    const logs = rows.map((row) => ({
      id: row.id,
      event: row.event,
      userId: row.user_id,
      sessionId: row.session_id,
      appProjectId: row.app_project_id,
      v0ProjectId: row.v0_project_id,
      chatId: row.chat_id,
      promptOriginal: row.prompt_original,
      promptFormatted: row.prompt_formatted,
      systemPrompt: row.system_prompt,
      promptAssistModel: row.prompt_assist_model,
      promptAssistDeep: row.prompt_assist_deep,
      promptAssistMode: row.prompt_assist_mode,
      buildIntent: row.build_intent,
      buildMethod: row.build_method,
      modelTier: row.model_tier,
      imageGenerations: row.image_generations,
      thinking: row.thinking,
      attachmentsCount: row.attachments_count,
      meta: row.meta,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
    }));

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("[API/admin/prompt-logs] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch prompt logs" },
      { status: 500 },
    );
  }
}
