import { describe, expect, it } from "vitest";

import {
  buildUserPromptContent,
  extractComplexityHintFromMeta,
  extractPageCountHintFromMeta,
  extractStyleKeywordsHintFromMeta,
  isVideoRequestAttachment,
  normalizeRequestAttachments,
  VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
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

  it("passes a variant template still to vision without exposing it as an embeddable asset", () => {
    const referenceUrl = `${BLOB}/template-still.jpg`;
    const content = buildUserPromptContent("Bygg sajten", [
      {
        type: "system_reference",
        url: referenceUrl,
        filename: "template-style-reference.jpg",
        mimeType: "image/jpeg",
        purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
      },
    ]);

    expect(Array.isArray(content)).toBe(true);
    const text = textOf(content);
    expect(text).toContain("Variant template style reference");
    expect(text).toContain("do not embed");
    expect(text).not.toContain(referenceUrl);
    expect(text).not.toContain("use these exact assets");
    if (Array.isArray(content)) {
      expect(content.some((part) => part.type === "image" && part.image === referenceUrl)).toBe(
        true,
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

  it("never classifies one attachment as both image and video (mime wins over extension)", () => {
    // image MIME but a .mp4 filename must resolve to image only
    const imageMimeVideoExt: RequestAttachment = {
      url: `${BLOB}/weird.mp4`,
      filename: "weird.mp4",
      mimeType: "image/jpeg",
    };
    expect(isVideoRequestAttachment(imageMimeVideoExt)).toBe(false);

    const text = textOf(buildUserPromptContent("Använd bilden", [imageMimeVideoExt]));
    expect(text).toContain("**Images**");
    expect(text).not.toContain("**Videos**");
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

  it("normalizeRequestAttachments låter inte en klient sätta systemreferens-markören", () => {
    // Markören är serverreserverad. Går den igenom klassas användarbilden som
    // systemreferens och utesluts ur URL-textblocket — modellen ser bilden men
    // saknar adressen och hittar på en lokal /media/-sökväg.
    const normalized = normalizeRequestAttachments([
      {
        url: `${BLOB}/mine.jpg`,
        mimeType: "image/jpeg",
        purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
      },
    ]);

    expect(normalized[0].purpose).toBeUndefined();
    expect(textOf(buildUserPromptContent("bygg en sajt", normalized))).toContain(
      `${BLOB}/mine.jpg`,
    );
  });
});

describe("extractPageCountHintFromMeta (Byggval)", () => {
  it("accepts integers in the 1–20 range", () => {
    expect(extractPageCountHintFromMeta({ pageCountHint: 3 })).toBe(3);
    expect(extractPageCountHintFromMeta({ pageCountHint: 1 })).toBe(1);
    expect(extractPageCountHintFromMeta({ pageCountHint: 20 })).toBe(20);
  });

  it("rejects out-of-range, non-integer and malformed values", () => {
    expect(extractPageCountHintFromMeta({ pageCountHint: 0 })).toBeNull();
    expect(extractPageCountHintFromMeta({ pageCountHint: 21 })).toBeNull();
    expect(extractPageCountHintFromMeta({ pageCountHint: 2.5 })).toBeNull();
    expect(extractPageCountHintFromMeta({ pageCountHint: "3" })).toBeNull();
    expect(extractPageCountHintFromMeta({})).toBeNull();
    expect(extractPageCountHintFromMeta(null)).toBeNull();
  });
});

describe("extractComplexityHintFromMeta (Byggval)", () => {
  it("accepts exactly the three enum values", () => {
    expect(extractComplexityHintFromMeta({ complexityHint: "simple" })).toBe("simple");
    expect(extractComplexityHintFromMeta({ complexityHint: "medium" })).toBe("medium");
    expect(extractComplexityHintFromMeta({ complexityHint: "complex" })).toBe("complex");
  });

  it("rejects everything else", () => {
    expect(extractComplexityHintFromMeta({ complexityHint: "auto" })).toBeNull();
    expect(extractComplexityHintFromMeta({ complexityHint: 3 })).toBeNull();
    expect(extractComplexityHintFromMeta({})).toBeNull();
    expect(extractComplexityHintFromMeta(null)).toBeNull();
  });
});

describe("extractStyleKeywordsHintFromMeta (Byggval)", () => {
  it("trims, dedupes case-insensitively and caps at 8", () => {
    expect(
      extractStyleKeywordsHintFromMeta({
        styleKeywordsHint: [" warm ", "Warm", "lokal", 42, "", "a".repeat(41)],
      }),
    ).toEqual(["warm", "lokal"]);
    const many = Array.from({ length: 12 }, (_, i) => `kw${i}`);
    expect(extractStyleKeywordsHintFromMeta({ styleKeywordsHint: many })).toHaveLength(8);
  });

  it("returns empty array for malformed meta", () => {
    expect(extractStyleKeywordsHintFromMeta({ styleKeywordsHint: "warm" })).toEqual([]);
    expect(extractStyleKeywordsHintFromMeta(null)).toEqual([]);
  });
});
