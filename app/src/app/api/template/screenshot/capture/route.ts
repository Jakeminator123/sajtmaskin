import { NextRequest, NextResponse } from "next/server";
import { saveTemplateScreenshot } from "@/lib/database";
import fs from "fs";
import path from "path";

/**
 * POST /api/template/screenshot/capture
 *
 * Captures a screenshot of a demoUrl and saves it locally.
 * Uses thum.io free screenshot service (no API key needed).
 *
 * Body:
 * {
 *   templateId: string,
 *   demoUrl: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, demoUrl } = body;

    if (!templateId || !demoUrl) {
      return NextResponse.json(
        { success: false, error: "Missing templateId or demoUrl" },
        { status: 400 }
      );
    }

    console.log(
      "[API /screenshot/capture] Capturing screenshot for:",
      templateId
    );

    // Use thum.io free screenshot service
    const screenshotApiUrl = `https://image.thum.io/get/width/800/crop/500/noanimate/${encodeURIComponent(
      demoUrl
    )}`;

    // Fetch the screenshot
    const response = await fetch(screenshotApiUrl);

    if (!response.ok) {
      console.error(
        "[API /screenshot/capture] Failed to fetch screenshot:",
        response.status
      );
      return NextResponse.json(
        { success: false, error: "Failed to capture screenshot" },
        { status: 500 }
      );
    }

    // Get image buffer
    const imageBuffer = await response.arrayBuffer();

    // Save to public/screenshots folder
    const screenshotsDir = path.join(process.cwd(), "public", "screenshots");

    // Ensure directory exists
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filename = `${templateId}.jpg`;
    const filePath = path.join(screenshotsDir, filename);

    // Write file
    fs.writeFileSync(filePath, Buffer.from(imageBuffer));

    // Save path to database
    const localPath = `/screenshots/${filename}`;
    saveTemplateScreenshot(templateId, localPath);

    console.log(
      "[API /screenshot/capture] Saved screenshot for:",
      templateId,
      "at",
      localPath
    );

    return NextResponse.json({
      success: true,
      templateId,
      screenshotPath: localPath,
    });
  } catch (error) {
    console.error("[API /screenshot/capture] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to capture screenshot" },
      { status: 500 }
    );
  }
}
