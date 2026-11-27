import { VIDEO_GENERATION_SOURCE_MIME_TYPES } from "./video-generation-contract";

export type VideoGenerationIntent = {
  prompt: string;
  insert: boolean;
  placement?: string;
  approvedCredits?: number;
  sourceMediaId?: number;
};

type IntentAttachment = { id: string; mimeType: string; status: string };

function selectedImageId(files: readonly IntentAttachment[]): number | undefined {
  const images = files.filter((file) => file.status === "success" && VIDEO_GENERATION_SOURCE_MIME_TYPES.includes(file.mimeType));
  if (images.length !== 1) return undefined;
  const id = /^(?:media-)?([1-9]\d*)$/.exec(images[0].id)?.[1];
  const numeric = Number(id);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

export function resolveVideoGenerationIntent(
  input: string,
  files: readonly IntentAttachment[],
): VideoGenerationIntent | undefined {
  // This is an action on an explicit user request. Mentions of video, existing
  // embeds and questions about the feature must keep their normal route.
  const text = input.trim();
  const request = /^(?:(?:hej[,!]?\s*)?(?:kan|skulle|vill)\s+du\s+(?:snälla\s+)?|(?:snälla|please)\s+|(?:jag\s+vill\s+(?:att\s+du\s+)?))?(?:skapa|generera|gör|beställ|köp|generate|create|make)\s+(?:(?:en|ett|a|one)\s+)?(?:(?:ny|kort|new|short|fem sekunders|5 sekunders|5-second)\s+)*(?:videofilm|videoklipp|video clip|video|film|clip)\b/i;
  if (!request.test(text) || /\b(?:skapa inte|generera inte|just show me how|utan att (?:skapa|generera)|hur (?:man|jag) (?:skapar|genererar))\b/i.test(text)) return undefined;

  const budget = /(?:^|[.!?;]\s+)(?:jag godkänner (?:högst|max(?:imalt)?)|du får (?:använda|spendera) (?:högst|max(?:imalt)?)|i (?:approve|authorize) (?:up to|at most))\s+([1-9]\d{0,5})\s+(?:krediter|credits)\.?$/i.exec(text);
  const command = budget ? text.slice(0, budget.index) : text;
  const insert = /\b(?:och|and)\s+(?:lägg (?:in|till)|bädda in|infoga|placera|sätt in|embed|insert|add)\b/i.exec(command);
  const placement = insert ? command.slice(insert.index + insert[0].length).trim() : "";
  const prompt = (insert ? command.slice(0, insert.index) : command).replace(request, "")
    .replace(/^\s*[:;,.–-]?\s*/, "").replace(/[.!?]+$/, "").trim();
  const sourceMediaId = selectedImageId(files);

  return {
    prompt: prompt && !/^(?:från|av|from|using)\s+(?:den |min |the |my )?(?:bifogade|valda|attached|selected)?\s*(?:startbilden|bilden|image|photo)$/i.test(prompt) ? prompt : "",
    insert: Boolean(insert),
    ...(placement ? { placement } : {}),
    ...(budget ? { approvedCredits: Number(budget[1]) } : {}),
    ...(sourceMediaId ? { sourceMediaId } : {}),
  };
}
