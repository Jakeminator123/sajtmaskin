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

export function getAttachmentMediaType(attachment: RequestAttachment): string | undefined {
  const direct = asTrimmedString(attachment.mimeType);
  if (direct) return direct;
  const filename = asTrimmedString(attachment.filename);
  if (filename) {
    const fromFilename = inferMediaTypeFromPath(filename);
    if (fromFilename) return fromFilename;
  }
  return inferMediaTypeFromPath(attachment.url);
}

export function isImageAttachment(attachment: RequestAttachment): boolean {
  return (getAttachmentMediaType(attachment) || "").startsWith("image/");
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

export function getVisualReferenceAttachments(
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

export function buildUserPromptContent(
  prompt: string,
  attachments?: RequestAttachment[],
): UserPromptContent {
  const visualAttachments = getVisualReferenceAttachments(attachments ?? []);
  if (visualAttachments.length === 0) return prompt;

  const parts: Array<
    { type: "text"; text: string } | { type: "image"; image: string; mediaType?: string }
  > = [{ type: "text", text: prompt }];

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
