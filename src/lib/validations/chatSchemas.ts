import { z } from "zod";
import { MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";

export const modelTiers = ["v0-mini", "v0-pro", "v0-max"] as const;
export type ModelTier = (typeof modelTiers)[number];
const MAX_ATTACHMENTS_PER_MESSAGE = 24;

const modelIdSchema = z
  .string()
  .trim()
  .min(1, "Model ID is required")
  .max(80, "Model ID is too long");

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
  attachments: z.array(z.any()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  system: z.string().max(MAX_CHAT_SYSTEM_CHARS).optional(),
  projectId: z.string().optional(),
  modelId: modelIdSchema.optional().default("v0-max"),
  thinking: z.boolean().optional(),
  imageGenerations: z.boolean().optional(),
  chatPrivacy: z.enum(["public", "private"]).optional(),
  meta: promptMetaSchema.optional(),
});

export const sendMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(MAX_CHAT_MESSAGE_CHARS, `Message too long (max ${MAX_CHAT_MESSAGE_CHARS} chars)`),
  attachments: z.array(z.any()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
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
