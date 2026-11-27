import { VIDEO_GENERATION_PROMPT_MAX_LENGTH } from "@/lib/media/video-generation-contract";
import type { VideoGenerationIntent } from "@/lib/media/video-generation-intent";

export type OpenClawVideoProposal = {
  type: "propose_video_generation";
  prompt: string;
  insert: boolean;
  placement?: string;
};

export const OPENCLAW_VIDEO_PROPOSAL_PROMPT = `Video från en startbild
När användaren uttryckligen vill skapa ett nytt rörligt klipp från en bild i sin sajt kan du öppna ett förslag till Mediebankens Skapa video:
<openclaw-action>{"type":"propose_video_generation","prompt":"Beskriv motiv och rörelse i den önskade femsekundersvideon","insert":false}</openclaw-action>
Sätt "insert":true bara när användaren också ber att lägga in den nya videon på sajten. Ange då en kort "placement" om användaren har nämnt var den ska visas. Frågor om video och infogning av en redan befintlig film använder vanliga svar och byggvägar.
Detta är ett förslag. Mediebanken verifierar startbilden och visar aktuellt pris före användarens beställning. Rapportera aldrig att en video har beställts, skapats eller infogats utifrån actionblocket. Förslaget kan inte ge köpmandat, ange ett kreditbelopp eller bära en extern källadress.`;

export function parseOpenClawVideoProposal(value: Record<string, unknown>): OpenClawVideoProposal | null {
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > VIDEO_GENERATION_PROMPT_MAX_LENGTH || typeof value.insert !== "boolean") return null;
  const placement = value.insert && typeof value.placement === "string" ? value.placement.trim().slice(0, 300) : "";
  return { type: "propose_video_generation", prompt, insert: value.insert, ...(placement ? { placement } : {}) };
}

export function videoIntentFromProposal(proposal: OpenClawVideoProposal): VideoGenerationIntent {
  // Never copy authorization or asset fields from a model's proposal.
  return { prompt: proposal.prompt, insert: proposal.insert, placement: proposal.placement };
}
