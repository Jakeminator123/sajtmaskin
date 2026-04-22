import { z } from "zod";
import { MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import {
  ACCEPTED_MODEL_IDS,
  DEFAULT_MODEL_ID,
  type CanonicalModelId,
} from "@/lib/models/catalog";
import { PROMPT_ASSIST_MODES } from "@/lib/hooks/prompt-assist-types";

export type ModelTier = CanonicalModelId;

const MAX_ATTACHMENTS_PER_MESSAGE = 24;

const attachmentSchema = z.object({
  type: z.string().optional(),
  url: z.string().url("Attachment must have a valid URL"),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().optional(),
  purpose: z.string().optional(),
});

const modelIdSchema = z.enum(
  ACCEPTED_MODEL_IDS as unknown as [string, ...string[]],
);

const MAX_PROMPT_META_TEXT_CHARS = MAX_CHAT_MESSAGE_CHARS;
const MAX_PROMPT_META_LABEL_CHARS = 200;

/**
 * Loose shape for `meta.brief`. The field is allowed to passthrough (so
 * wizard/Deep Brief can add new keys without breaking the boundary), but a
 * subset is validated so malformed client state is caught here — not after
 * it reaches orchestration / prompt building.
 */
const briefMetaSchema = z
  .object({
    industry: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    businessType: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    primaryCallToAction: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    primaryCallToActionId: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    toneAndVoice: z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(16).optional(),
    tagline: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    mustHave: z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(64).optional(),
    pages: z
      .array(
        z.object({
          name: z.string().max(MAX_PROMPT_META_LABEL_CHARS),
          path: z.string().max(MAX_PROMPT_META_LABEL_CHARS),
        }).passthrough(),
      )
      .max(32)
      .optional(),
    visualDirection: z
      .object({
        styleKeywords: z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(16).optional(),
        imagery: z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(16).optional(),
        avoid: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
      })
      .passthrough()
      .optional(),
    // Deep Brief producerar `avoid` som string[] (site-brief-generation.ts),
    // medan wizard-/legacy-shape kan skicka en kommaseparerad sträng. Union
    // håller båda formerna giltiga utan client-side shape-normalisering.
    avoid: z
      .union([
        z.string().max(MAX_PROMPT_META_TEXT_CHARS),
        z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(32),
      ])
      .optional(),
    // Deep Brief emits an imagery-objekt (styleKeywords, suggestedSubjects,
    // avoid…); wizard/legacy emits string[]. Union + passthrough ger båda
    // formerna fri passage genom API-gränsen.
    imagery: z
      .union([
        z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(16),
        z.object({}).passthrough(),
      ])
      .optional(),
    oneSentencePitch: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    targetAudience: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    uniqueValueProposition: z.array(z.string().max(MAX_PROMPT_META_LABEL_CHARS)).max(16).optional(),
    testimonialsSummary: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    coreMessage: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    caseStudiesSummary: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    briefSource: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    briefQuality: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
  })
  .partial()
  .passthrough();

const promptMetaSchema = z
  .object({
    promptOriginal: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    promptFormatted: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
    promptAssistModel: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    promptAssistDeep: z.boolean().optional(),
    promptAssistMode: z.enum(PROMPT_ASSIST_MODES).optional(),
    buildIntent: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    buildMethod: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    formattedChanged: z.boolean().optional(),
    promptLength: z.number().int().nonnegative().optional(),
    formattedLength: z.number().int().nonnegative().optional(),
    attachmentsCount: z.number().int().nonnegative().optional(),
    planMode: z.boolean().optional(),
    /** Own-engine: edit base = this version's `files_json` (canonical store). */
    engineBaseVersionId: z.string().min(1).max(128).optional(),
    promptSourceKind: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
    promptSourceTechnical: z.boolean().optional(),
    promptSourcePreservePayload: z.boolean().optional(),
    brief: briefMetaSchema.optional(),
    /**
     * B3: Structured build-out-request från `shellRoute → onBuildOutRouteRequest`.
     * Byggs i UI när användaren klickar "+"-ikonen bredvid en shell-route. Ger
     * backend ett tydligt signal om att den här routen ska byggas ut (inte
     * återgenereras) med ev. förberedd intent/name från PlannedRoute.
     */
    buildOut: z
      .object({
        path: z.string().max(MAX_PROMPT_META_LABEL_CHARS),
        intent: z.string().max(MAX_PROMPT_META_TEXT_CHARS).optional(),
        name: z.string().max(MAX_PROMPT_META_LABEL_CHARS).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .partial()
  .passthrough();

export const createChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(MAX_CHAT_MESSAGE_CHARS, `Message too long (max ${MAX_CHAT_MESSAGE_CHARS} chars)`),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  system: z.string().max(MAX_CHAT_SYSTEM_CHARS).optional(),
  projectId: z.string().optional(),
  modelId: modelIdSchema.optional().default(DEFAULT_MODEL_ID),
  thinking: z.boolean().optional(),
  imageGenerations: z.boolean().optional(),
  chatPrivacy: z.enum(["public", "private", "team-edit", "team", "unlisted"]).optional(),
  designSystemId: z.string().optional(),
  meta: promptMetaSchema.optional(),
});

export const sendMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(MAX_CHAT_MESSAGE_CHARS, `Message too long (max ${MAX_CHAT_MESSAGE_CHARS} chars)`),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  system: z.string().max(MAX_CHAT_SYSTEM_CHARS).optional(),
  modelId: modelIdSchema.optional(),
  thinking: z.boolean().optional(),
  imageGenerations: z.boolean().optional(),
  designSystemId: z.string().optional(),
  meta: promptMetaSchema.optional(),
});
