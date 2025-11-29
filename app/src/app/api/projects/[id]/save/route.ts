import { NextRequest, NextResponse } from "next/server";
import { getProjectById, saveProjectData } from "@/lib/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/save - Save project data (chat, files, etc.)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const project = getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const { chatId, demoUrl, currentCode, files, messages } = body;

    saveProjectData({
      project_id: id,
      chat_id: chatId,
      demo_url: demoUrl,
      current_code: currentCode,
      files: files || [],
      messages: messages || [],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] Failed to save project data:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
