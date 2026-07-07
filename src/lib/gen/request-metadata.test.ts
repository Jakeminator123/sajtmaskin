import { describe, expect, it } from "vitest";

import {
  buildUserPromptContent,
  isVideoRequestAttachment,
  normalizeRequestAttachments,
  type RequestAttachment,
} from "./request-metadata";

const BLOB = "https://abc123.public.blob.vercel-storage.com/user/media";

function textOf(content: ReturnType<typeof buildUserPromptContent>): string {
  if (typeof content === "string") return content;
  const first = content[0];
  return first && first.type === "text" ? first.text : "";
}

describe("buildUserPromptContent — attached media", () => {
  it("hands the model the exact image URL as text AND on the vision channel", () => {
    const attachments: RequestAttachment[] = [
      { type: "user_file", url: `${BLOB}/john-hampus.jpg`, filename: "john-hampus.jpg", mimeType: "image/jpeg" },
    ];
    const content = buildUserPromptContent("Använd denna som headerbild", attachments);

    // multimodal array (vision) is returned when an image is present
    expect(Array.isArray(content)).toBe(true);
    const text = textOf(content);
    expect(text).toContain("Attached media");
    expect(text).toContain(`${BLOB}/john-hampus.jpg`);
    // guards against the fabricated-local-path regression
    expect(text).toContain("Do NOT invent local");

    if (Array.isArray(content)) {
      const imagePart = content.find((p) => p.type === "image");
      expect(imagePart && imagePart.type === "image" ? imagePart.image : "").toBe(
        `${BLOB}/john-hampus.jpg`,
      );
    }
  });

  it("instructs embedding an attached video with its exact URL (no vision part)", () => {
    const attachments: RequestAttachment[] = [
      { type: "user_file", url: `${BLOB}/promo.mp4`, filename: "promo.mp4", mimeType: "video/mp4" },
    ];
    const content = buildUserPromptContent("Lägg in filmen högst upp", attachments);

    // no image → plain string
    expect(typeof content).toBe("string");
    const text = textOf(content);
    expect(text).toContain("Videos");
    expect(text).toContain(`${BLOB}/promo.mp4`);
    expect(text).toContain("<video");
  });

  it("still lists non-embeddable docs (pdf/text) as reference material", () => {
    const attachments: RequestAttachment[] = [
      { type: "user_file", url: `${BLOB}/brief.pdf`, filename: "brief.pdf", mimeType: "application/pdf" },
    ];
    const text = textOf(buildUserPromptContent("Följ briefen", attachments));
    expect(text).toContain("Non-image attachments");
    expect(text).toContain(`${BLOB}/brief.pdf`);
  });

  it("returns the plain prompt untouched when there are no attachments", () => {
    expect(buildUserPromptContent("Bara text", [])).toBe("Bara text");
    expect(buildUserPromptContent("Bara text")).toBe("Bara text");
  });

  it("detects video by extension when the mime type is missing", () => {
    const byExt: RequestAttachment = { url: `${BLOB}/clip.webm`, filename: "clip.webm" };
    const byMime: RequestAttachment = { url: `${BLOB}/x`, filename: "x", mimeType: "video/quicktime" };
    const notVideo: RequestAttachment = { url: `${BLOB}/logo.png`, filename: "logo.png", mimeType: "image/png" };
    expect(isVideoRequestAttachment(byExt)).toBe(true);
    expect(isVideoRequestAttachment(byMime)).toBe(true);
    expect(isVideoRequestAttachment(notVideo)).toBe(false);
  });

  it("normalizeRequestAttachments keeps url + metadata and drops junk", () => {
    const normalized = normalizeRequestAttachments([
      { url: `${BLOB}/a.jpg`, filename: "a.jpg", mimeType: "image/jpeg", size: 1234 },
      { nope: true },
      "not-an-object",
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].url).toBe(`${BLOB}/a.jpg`);
    expect(normalized[0].size).toBe(1234);
  });
});
