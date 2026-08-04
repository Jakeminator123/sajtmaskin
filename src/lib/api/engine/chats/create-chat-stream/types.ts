/**
 * Delade typalias för `create-chat-stream/*`. Alla härleds ur befintliga
 * signaturer så de extraherade modulerna får exakt samma typer som
 * lokalvariablerna hade i `create-chat-stream-post.ts`.
 */
import type { createChatSchema } from "@/lib/validations/chatSchemas";
import type { prepareCredits } from "@/lib/credits/server";
import type { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import type { resolveModelSelection } from "@/lib/models/selection";
import type { normalizeRequestAttachments } from "@/lib/gen/request-metadata";
import type { getBuildProfileId } from "@/lib/models/catalog";
import type { createCommitCreditsOnce } from "../credits-handler";

export type CreateChatRequestData = ReturnType<(typeof createChatSchema)["parse"]>;
export type CreateChatCreditUser = Extract<
  Awaited<ReturnType<typeof prepareCredits>>,
  { ok: true }
>["user"];
export type CreateChatStrategyMeta = ReturnType<
  typeof orchestratePromptMessage
>["strategyMeta"];
export type CreateChatModelTier = ReturnType<typeof resolveModelSelection>["modelTier"];
export type CreateChatRequestAttachments = ReturnType<typeof normalizeRequestAttachments>;
export type CreateChatBuildProfileId = ReturnType<typeof getBuildProfileId>;
export type CreateChatCommitCredits = ReturnType<typeof createCommitCreditsOnce>;
export type CreateChatPrivacy = NonNullable<CreateChatRequestData["chatPrivacy"]>;
