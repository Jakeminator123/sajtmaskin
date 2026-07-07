import { normalizePaletteState, type PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";

import type { DesignReferenceAsset } from "./system-prompt";

export type RequestAttachment = {
  type?: string;
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

type UserPromptContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; image: string; mediaType?: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferMediaTypeFromPath(path: string): string | undefined {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  return undefined;
}

function getFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.split("/").filter(Boolean).pop();
    return pathname ? decodeURIComponent(pathname) : "";
  } catch {
    return "";
  }
}

function getAttachmentMediaType(attachment: RequestAttachment): string | undefined {
  const direct = asTrimmedString(attachment.mimeType);
  if (direct) return direct;
  const filename = asTrimmedString(attachment.filename);
  if (filename) {
    const fromFilename = inferMediaTypeFromPath(filename);
    if (fromFilename) return fromFilename;
  }
  return inferMediaTypeFromPath(attachment.url);
}

function isImageAttachment(attachment: RequestAttachment): boolean {
  return (getAttachmentMediaType(attachment) || "").startsWith("image/");
}

function isVideoAttachment(attachment: RequestAttachment): boolean {
  const mime = (getAttachmentMediaType(attachment) || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  // A known image MIME wins over a filename-extension guess so an attachment is
  // never classified as both image and video (which would emit conflicting
  // <Image> + <video> embed instructions for the same URL).
  if (mime.startsWith("image/")) return false;
  const source = (asTrimmedString(attachment.filename) || attachment.url || "").toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(source);
}

/** MIME type for an attachment (filename/url fallback). */
export function getRequestAttachmentMediaType(
  attachment: RequestAttachment,
): string | undefined {
  return getAttachmentMediaType(attachment);
}

export function isImageRequestAttachment(attachment: RequestAttachment): boolean {
  return isImageAttachment(attachment);
}

export function isVideoRequestAttachment(attachment: RequestAttachment): boolean {
  return isVideoAttachment(attachment);
}

function formatNonImageAttachmentDescriptors(attachments: RequestAttachment[]): string {
  // Images and videos are handled by formatEmbeddableMediaReferences (they get
  // explicit "embed with the exact URL" instructions). This block covers the
  // remaining document/reference files (PDF, text, etc.).
  const nonVisual = attachments.filter(
    (a) => !isImageAttachment(a) && !isVideoAttachment(a),
  );
  if (nonVisual.length === 0) return "";

  const lines: string[] = [
    "## Non-image attachments (user-provided)",
    "",
    "The user attached the following files. Use their names and purposes when relevant; text excerpts may appear below this block in the prompt.",
    "",
  ];
  for (const a of nonVisual) {
    const name =
      asTrimmedString(a.filename) || getFilenameFromUrl(a.url) || "attachment";
    const mime = getAttachmentMediaType(a) || "unknown";
    const purpose = asTrimmedString(a.purpose);
    const size =
      typeof a.size === "number" && Number.isFinite(a.size) ? `${a.size} bytes` : null;
    lines.push(
      `- **${name}** (${mime})${purpose ? ` — purpose: ${purpose}` : ""}${size ? ` — size: ${size}` : ""}`,
      `  - URL: ${a.url}`,
    );
  }
  lines.push("");
  return lines.join("\n").trimEnd();
}

export function normalizeRequestAttachments(input: unknown): RequestAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => {
      if (!isRecord(value)) return null;
      const url = asTrimmedString(value.url);
      if (!url) return null;
      const filename = asTrimmedString(value.filename);
      const mimeType = asTrimmedString(value.mimeType);
      const purpose = asTrimmedString(value.purpose);
      const type = asTrimmedString(value.type);
      const size =
        typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0
          ? value.size
          : undefined;

      return {
        url,
        ...(type ? { type } : {}),
        ...(filename ? { filename } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(purpose ? { purpose } : {}),
        ...(typeof size === "number" ? { size } : {}),
      } satisfies RequestAttachment;
    })
    .filter((attachment): attachment is RequestAttachment => Boolean(attachment));
}

function getVisualReferenceAttachments(
  attachments: RequestAttachment[],
  max = 4,
): RequestAttachment[] {
  return attachments
    .filter((attachment) => isImageAttachment(attachment))
    .slice(0, max)
    .map((attachment) => ({
      ...attachment,
      mimeType: attachment.mimeType || getAttachmentMediaType(attachment),
    }));
}

/**
 * Emits a text block that hands the model the EXACT URLs of user-attached
 * images/videos so it can wire them into `<img>`/`next/image`/`<video>` `src`
 * attributes. Images are also passed on the multimodal (vision) channel, but
 * the model needs the URL as *text* to reproduce it in code — without this it
 * fabricates non-existent local paths like `/media/<name>.jpg` (see the
 * "Attached media wins" rule in config/prompt-core/04-coding-direction.md).
 */
function formatEmbeddableMediaReferences(attachments: RequestAttachment[]): string {
  const images = attachments.filter((a) => isImageAttachment(a));
  const videos = attachments.filter((a) => isVideoAttachment(a));
  if (images.length === 0 && videos.length === 0) return "";

  const describe = (a: RequestAttachment, fallback: string): string[] => {
    const name = asTrimmedString(a.filename) || getFilenameFromUrl(a.url) || fallback;
    const mime = getAttachmentMediaType(a) || fallback;
    const purpose = asTrimmedString(a.purpose);
    return [`- **${name}** (${mime})${purpose ? ` — purpose: ${purpose}` : ""}`, `  - URL: ${a.url}`];
  };

  const lines: string[] = [
    "## Attached media (user-provided — use these exact assets)",
    "",
    "Embed each asset below using its EXACT URL. Do NOT invent local `/media/...` or `/public/media/...` paths, and do NOT swap in a stock photo or `/placeholder.svg` for an attached asset.",
    "",
  ];

  if (images.length > 0) {
    lines.push(
      '**Images** — render with `next/image` `<Image src="<url>" … unoptimized />` (or a plain `<img>`); always set a descriptive `alt`:',
      "",
    );
    for (const a of images) lines.push(...describe(a, "image"));
    lines.push("");
  }

  if (videos.length > 0) {
    lines.push(
      '**Videos** — embed with `<video controls playsInline src="<url>" …>` (or a `<source>` child) using the exact URL; add a subject-relevant `poster` and graceful fallback copy:',
      "",
    );
    for (const a of videos) lines.push(...describe(a, "video"));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildUserPromptContent(
  prompt: string,
  attachments?: RequestAttachment[],
): UserPromptContent {
  const list = attachments ?? [];
  const trimmed = prompt.trimEnd();
  const mediaReferenceBlock = formatEmbeddableMediaReferences(list);
  const descriptorBlock = formatNonImageAttachmentDescriptors(list);
  const textPrompt = [trimmed, mediaReferenceBlock, descriptorBlock]
    .filter((section) => section.length > 0)
    .join("\n\n");

  const visualAttachments = getVisualReferenceAttachments(list);
  if (visualAttachments.length === 0) return textPrompt;

  const parts: Array<
    { type: "text"; text: string } | { type: "image"; image: string; mediaType?: string }
  > = [{ type: "text", text: textPrompt }];

  for (const attachment of visualAttachments) {
    parts.push({
      type: "image",
      image: attachment.url,
      ...(attachment.mimeType ? { mediaType: attachment.mimeType } : {}),
    });
  }

  return parts;
}

export function summarizeDesignReferences(
  attachments: RequestAttachment[],
): DesignReferenceAsset[] {
  const visualAttachments = getVisualReferenceAttachments(attachments, 6);

  return visualAttachments.map((attachment, index) => {
    const filename =
      asTrimmedString(attachment.filename) || getFilenameFromUrl(attachment.url) || `reference-${index + 1}`;
    if (attachment.purpose === "figma-reference") {
      return {
        kind: "figma",
        label: filename,
        note: "Use it to mirror hierarchy, spacing rhythm, and component composition before polishing visuals.",
      };
    }

    return {
      kind: "image",
      label: filename,
      note: "Use it as a visual reference for composition, style, or UI treatment when relevant.",
    };
  });
}

export function extractThemeColorsFromMeta(meta: unknown): ThemeColors | null {
  if (!isRecord(meta) || !isRecord(meta.themeColors)) return null;
  const primary = asTrimmedString(meta.themeColors.primary);
  const secondary = asTrimmedString(meta.themeColors.secondary);
  const accent = asTrimmedString(meta.themeColors.accent);
  if (!primary || !secondary || !accent) return null;
  return { primary, secondary, accent };
}

export function extractBriefFromMeta(meta: unknown): Record<string, unknown> | null {
  if (!isRecord(meta) || !isRecord(meta.brief)) return null;
  return meta.brief;
}

export function extractDesignThemePresetFromMeta(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  const direct = asTrimmedString(meta.designTheme);
  if (direct) return direct;
  const alias = asTrimmedString(meta.designThemePreset);
  return alias || null;
}

export function extractPaletteStateFromMeta(meta: unknown): PaletteState | null {
  if (!isRecord(meta)) return null;
  const normalized = normalizePaletteState(meta.palette);
  return normalized.selections.length > 0 ? normalized : null;
}

export function extractAppProjectIdFromMeta(meta: unknown): string {
  if (!isRecord(meta)) return "";
  return asTrimmedString(meta.appProjectId);
}

export function extractScaffoldSettingsFromMeta(meta: unknown): {
  scaffoldMode: "auto" | "manual" | "off";
  scaffoldId: string | null;
} {
  if (!isRecord(meta)) {
    return { scaffoldMode: "auto", scaffoldId: null };
  }

  const rawMode = asTrimmedString(meta.scaffoldMode);
  const scaffoldMode =
    rawMode === "manual" || rawMode === "off" || rawMode === "auto" ? rawMode : "auto";
  const scaffoldId = asTrimmedString(meta.scaffoldId) || null;
  return { scaffoldMode, scaffoldId };
}
