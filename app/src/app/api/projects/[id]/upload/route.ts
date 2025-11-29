import { NextRequest, NextResponse } from "next/server";
import { getProjectById, saveImage, getUploadsDir } from "@/lib/database";
import { writeFile } from "fs/promises";
import path from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/upload - Upload image
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const project = getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = path.extname(file.name);
    const filename = `${id}_${Date.now()}${ext}`;
    const uploadsDir = getUploadsDir();
    const filePath = path.join(uploadsDir, filename);

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Save record to database
    const imageRecord = saveImage(
      id,
      filename,
      filePath,
      file.name,
      file.type,
      file.size
    );

    // Return public URL
    const publicUrl = `/uploads/${filename}`;

    return NextResponse.json({
      success: true,
      image: {
        ...imageRecord,
        url: publicUrl,
      },
    });
  } catch (error: any) {
    console.error("[API] Failed to upload image:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
