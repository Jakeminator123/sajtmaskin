import { z } from "zod";

export const modelTiers = ["v0-mini", "v0-pro", "v0-max"] as const;
export type ModelTier = (typeof modelTiers)[number];

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
  message: z.string().min(1, "Message is required"),
  attachments: z.array(z.any()).optional(),
  system: z.string().optional(),
  projectId: z.string().optional(),
  modelId: z.enum(modelTiers).optional().default("v0-max"),
  thinking: z.boolean().optional(),
  imageGenerations: z.boolean().optional(),
  chatPrivacy: z.enum(["public", "private"]).optional(),
  meta: promptMetaSchema.optional(),
});

export const sendMessageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  attachments: z.array(z.any()).optional(),
  system: z.string().optional(),
  modelId: z.enum(modelTiers).optional(),
  thinking: z.boolean().optional(),
  imageGenerations: z.boolean().optional(),
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
