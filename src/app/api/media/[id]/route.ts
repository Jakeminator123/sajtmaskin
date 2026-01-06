import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  deleteMediaLibraryItem,
  getMediaLibraryItemById,
} from "@/lib/data/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Media Library Item API
 * ======================
 *
 * DELETE /api/media/[id] - Delete a media library item
 *
 * SECURITY:
 * - Requires authentication
 * - Users can only delete their own files (enforced by deleteMediaLibraryItem)
 */

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att ta bort filer",
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const mediaId = parseInt(id);

    if (isNaN(mediaId)) {
      return NextResponse.json(
        { success: false, error: "Ogiltigt fil-ID" },
        { status: 400 }
      );
    }

    // Check if item exists and belongs to user (for better error messages)
    const item = getMediaLibraryItemById(mediaId);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Filen hittades inte" },
        { status: 404 }
      );
    }

    if (item.user_id !== user.id) {
      // Don't reveal that the file exists to prevent enumeration attacks
      return NextResponse.json(
        {
          success: false,
          error: "Filen hittades inte eller du har inte behörighet",
        },
        { status: 404 }
      );
    }

    // Delete the file (both from disk/blob and database)
    const success = deleteMediaLibraryItem(mediaId, user.id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Kunde inte ta bort filen" },
        { status: 500 }
      );
    }

    console.log(`[Media/Delete] User ${user.id} deleted file ${mediaId}`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Media/Delete] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
