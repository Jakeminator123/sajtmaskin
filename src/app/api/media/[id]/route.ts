import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { deleteMediaLibraryItem, getMediaLibraryItemById } from "@/lib/db/services/media";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    if (!user && !sessionId) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad för att ta bort filer" },
        { status: 401 },
      );
    }
    const ownerId = user?.id ?? sessionId!;

    const { id } = await params;
    const mediaId = parseInt(id, 10);

    if (isNaN(mediaId)) {
      return NextResponse.json({ success: false, error: "Ogiltigt fil-ID" }, { status: 400 });
    }

    const item = await getMediaLibraryItemById(mediaId, ownerId);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Filen hittades inte eller du har inte behörighet" },
        { status: 404 },
      );
    }

    const success = await deleteMediaLibraryItem(mediaId, ownerId);
    if (!success) {
      return NextResponse.json(
        { success: false, error: "Kunde inte ta bort filen" },
        { status: 500 },
      );
    }

    console.info(`[Media/Delete] Owner ${ownerId} deleted file ${mediaId}`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Media/Delete] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
