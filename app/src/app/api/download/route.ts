import { NextRequest, NextResponse } from "next/server";
import { downloadVersionAsZip } from "@/lib/v0-generator";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chatId = searchParams.get("chatId");
  const versionId = searchParams.get("versionId");

  if (!chatId || !versionId) {
    return NextResponse.json(
      { success: false, error: "chatId and versionId are required" },
      { status: 400 }
    );
  }

  try {
    console.log("[API/download] Downloading ZIP for:", chatId, versionId);
    
    const zipBuffer = await downloadVersionAsZip(chatId, versionId);
    
    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="sajtmaskin-${chatId}.zip"`,
      },
    });
  } catch (error: any) {
    console.error("[API/download] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

