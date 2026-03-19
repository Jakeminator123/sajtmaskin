import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";
import { updateProject } from "@/lib/db/services/projects";

const VIEWPORT = { width: 1280, height: 800 };
const JPEG_QUALITY = 75;
const NAV_TIMEOUT_MS = 20_000;
const IDLE_TIMEOUT_MS = 6_000;

export async function captureScreenshot(
  url: string,
): Promise<Buffer | null> {
  const isServerless = Boolean(process.env.VERCEL);
  if (isServerless) {
    console.info("[thumbnail] Skipping capture in serverless — no Playwright.");
    return null;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await page
      .waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS })
      .catch(() => undefined);
    await page
      .evaluate(async () => {
        const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
        if (fonts?.ready) await fonts.ready.catch(() => {});
      })
      .catch(() => undefined);
    await page.waitForTimeout(400).catch(() => undefined);

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: JPEG_QUALITY,
      fullPage: false,
    });

    return Buffer.from(buffer);
  } catch (err) {
    console.error("[thumbnail] Screenshot failed:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export async function captureAndSaveProjectThumbnail(params: {
  url: string;
  projectId: string;
  userId: string;
}): Promise<string | null> {
  const { url, projectId, userId } = params;

  const buffer = await captureScreenshot(url);
  if (!buffer) return null;

  const filename = generateUniqueFilename("thumbnail.jpg", "thumb");
  const result = await uploadBlob({
    userId,
    filename,
    buffer,
    contentType: "image/jpeg",
    projectId,
    category: "project-files",
  });

  if (!result) {
    console.error("[thumbnail] Blob upload failed for project", projectId);
    return null;
  }

  await updateProject(projectId, { thumbnail_path: result.url });
  console.info("[thumbnail] Saved for project", projectId, result.url);
  return result.url;
}
