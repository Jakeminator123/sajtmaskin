import { z } from "zod";
import { MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import {
  ACCEPTED_MODEL_IDS,
  CANONICAL_MODEL_IDS,
  DEFAULT_MODEL_ID,
  type CanonicalModelId,
} from "@/lib/v0/models";

export const modelTiers = CANONICAL_MODEL_IDS;
export type ModelTier = CanonicalModelId;

export const acceptedModelIds = ACCEPTED_MODEL_IDS;
const MAX_ATTACHMENTS_PER_MESSAGE = 24;

const attachmentSchema = z.object({
  url: z.string().url("Attachment must have a valid URL"),
});

const modelIdSchema = z.enum(
  ACCEPTED_MODEL_IDS as unknown as [string, ...string[]],
);

const promptMetaSchema = z
  .object({
    promptOriginal: z.string().optional(),
    promptFormatted: z.string().optional(),
    promptAssistModel: z.string().optional(),
    promptAssistDeep: z.boolean().optional(),
    promptAssistMode: z.enum(["polish", "rewrite"]).optional(),
    buildIntent: z.string().optional(),
    buildMethod: z.string().optional(),
    formattedChanged: z.boolean().optional(),
    promptLength: z.number().int().nonnegative().optional(),
    formattedLength: z.number().int().nonnegative().optional(),
    attachmentsCount: z.number().int().nonnegative().optional(),
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
  meta: promptMetaSchema.optional(),
});

export const chatIdSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
});

export const messageIdSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  messageId: z.string().min(1, "Message ID is required"),
});

export const versionIdSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
});

export const createDeploymentSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  chatId: z.string().min(1, "Chat ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
});
