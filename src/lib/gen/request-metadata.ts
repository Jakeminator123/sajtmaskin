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

export const VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE =
  "variant-template-style-reference";

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

function isVariantTemplateStyleReference(
  attachment: RequestAttachment,
): boolean {
  return attachment.purpose === VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE;
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
    (a) =>
      !isVariantTemplateStyleReference(a) &&
      !isImageAttachment(a) &&
      !isVideoAttachment(a),
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
      // Markören är serverreserverad — pipelinen sätter den på sina egna
      // stilreferenser. Släpps en klientsatt variant igenom kan en användarbild
      // maskera sig som systemreferens och därmed uteslutas ur URL-textblocket:
      // modellen ser bilden på visionkanalen men får aldrig adressen, och
      // hittar då på en lokal /media/-sökväg i stället för att bädda in den.
      const rawPurpose = asTrimmedString(value.purpose);
      const purpose =
        rawPurpose === VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE ? undefined : rawPurpose;
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

/**
 * Vision-channel budget. Owner of the 4-image cap and "user images first"
 * priority. Callers that need to know what actually reached the model must
 * use this — do not copy the slice.
 */
export function getVisualReferenceAttachments(
  attachments: RequestAttachment[],
  max = 4,
): RequestAttachment[] {
  const images = attachments.filter((attachment) => isImageAttachment(attachment));
  // Systemets stilreferens läggs FÖRST i listan av anroparen, men den är det
  // enda i budgeten som inte är användarens eget innehåll — den är dessutom
  // märkt "do not embed", så platsen den tar kan aldrig bli en bild i sajten.
  // Ryms inte allt ska referensen falla bort, aldrig en användarbild.
  const userImages = images.filter(
    (attachment) => !isVariantTemplateStyleReference(attachment),
  );
  const styleReferences = images.filter((attachment) =>
    isVariantTemplateStyleReference(attachment),
  );
  return [...userImages, ...styleReferences]
    .slice(0, max)
    .map((attachment) => ({
      ...attachment,
      mimeType: attachment.mimeType || getAttachmentMediaType(attachment),
    }));
}

/** True when the variant still image survived the vision-channel cap. */
export function variantTemplateImageInSentPayload(
  attachments: RequestAttachment[],
): boolean {
  return getVisualReferenceAttachments(attachments).some(
    isVariantTemplateStyleReference,
  );
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
  const embeddable = attachments.filter(
    (attachment) => !isVariantTemplateStyleReference(attachment),
  );
  const images = embeddable.filter((a) => isImageAttachment(a));
  const videos = embeddable.filter((a) => isVideoAttachment(a));
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

function formatVariantTemplateStyleReferences(
  attachments: RequestAttachment[],
): string {
  const references = attachments.filter(
    (attachment) =>
      isVariantTemplateStyleReference(attachment) &&
      isImageAttachment(attachment),
  );
  if (references.length === 0) return "";

  return [
    "## Variant template style reference (system-selected — do not embed)",
    "",
    "One reference image is supplied on the vision channel. Inspect it for visual hierarchy, density, spacing rhythm, composition, and interaction cues only.",
    "Do NOT embed the reference image or its URL in the generated project. Do NOT copy its brand, text, logos, or assets. Adapt the visual ideas to the user's brief and the selected scaffold.",
  ].join("\n");
}

export function buildUserPromptContent(
  prompt: string,
  attachments?: RequestAttachment[],
): UserPromptContent {
  const list = attachments ?? [];
  const trimmed = prompt.trimEnd();
  const visualAttachments = getVisualReferenceAttachments(list);
  const mediaReferenceBlock = formatEmbeddableMediaReferences(list);
  const descriptorBlock = formatNonImageAttachmentDescriptors(list);
  // Härledd ur det som faktiskt ryms i visionbudgeten, inte ur hela listan:
  // texten säger "One reference image is supplied on the vision channel", och
  // det får inte stå kvar när referensen trängdes ut av användarens bilder.
  const styleReferenceBlock = formatVariantTemplateStyleReferences(visualAttachments);
  const textPrompt = [
    trimmed,
    mediaReferenceBlock,
    descriptorBlock,
    styleReferenceBlock,
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");

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

/**
 * Byggval (init controls): structured page-count hint. Clamped to the same
 * 1–20 range as `detectExplicitPageCount` so a malformed client can never
 * push the route plan outside what prompt text is allowed to.
 */
export function extractPageCountHintFromMeta(meta: unknown): number | null {
  if (!isRecord(meta)) return null;
  const raw = meta.pageCountHint;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw >= 1 && raw <= 20 ? raw : null;
}

/**
 * Byggval (init controls): structured complexity choice for BuildSpec
 * (`complex` → premium-golv + heavy context-bias; `simple` → lättare
 * context-bias; `medium` → recorded no-op).
 */
export function extractComplexityHintFromMeta(
  meta: unknown,
): "simple" | "medium" | "complex" | null {
  if (!isRecord(meta)) return null;
  const raw = meta.complexityHint;
  return raw === "simple" || raw === "medium" || raw === "complex" ? raw : null;
}

/**
 * Byggval (init controls): structured style keywords for scaffold-variant
 * matching. Trimmed, deduped and capped to 8 entries of max 40 chars.
 */
export function extractStyleKeywordsHintFromMeta(meta: unknown): string[] {
  if (!isRecord(meta) || !Array.isArray(meta.styleKeywordsHint)) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const entry of meta.styleKeywordsHint) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 40) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(trimmed);
    if (keywords.length >= 8) break;
  }
  return keywords;
}

/**
 * Byggval "Ton": structured keywords so the choice reaches the variant scorer.
 * Same shape and bounds as the style hints.
 */
export function extractToneKeywordsHintFromMeta(meta: unknown): string[] {
  if (!isRecord(meta) || !Array.isArray(meta.toneKeywordsHint)) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const entry of meta.toneKeywordsHint) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 40) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(trimmed);
    if (keywords.length >= 8) break;
  }
  return keywords;
}

/**
 * Byggval "Stil" as the raw choice. Kept as an enum rather than a variant id so
 * the client never names a variant: the scaffold is often still unresolved at
 * request time (site type = Auto), and only the server can map the pair.
 */
export function extractStyleChoiceHintFromMeta(
  meta: unknown,
): "warm" | "corporate" | "bold" | "editorial" | "minimal" | null {
  if (!isRecord(meta)) return null;
  const raw = asTrimmedString(meta.styleChoiceHint);
  return raw === "warm" ||
    raw === "corporate" ||
    raw === "bold" ||
    raw === "editorial" ||
    raw === "minimal"
    ? raw
    : null;
}

/** Byggval "Färgläge": picks which palette a color cluster resolves to. */
export function extractColorModeHintFromMeta(meta: unknown): "light" | "dark" | null {
  if (!isRecord(meta)) return null;
  const raw = asTrimmedString(meta.colorModeHint);
  return raw === "light" || raw === "dark" ? raw : null;
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
