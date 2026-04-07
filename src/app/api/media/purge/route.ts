import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { deleteAllUserMedia } from "@/lib/db/services/media";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    if (!user && !sessionId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const ownerId = user?.id ?? sessionId!;
    const deleted = await deleteAllUserMedia(ownerId);
    console.info(`[Media/Purge] Owner ${ownerId} purged ${deleted} files`);
    return NextResponse.json({ success: true, deleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Media/Purge] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
