export { parseMediaLibraryId as parseVideoGenerationMediaId } from "./media-library-id";

export const MAX_GENERATED_VIDEO_BYTES = 32 * 1024 * 1024;
export const VIDEO_GENERATION_MODEL = "gen4_turbo";
export const VIDEO_GENERATION_DURATION_SECONDS = 5;
export const VIDEO_GENERATION_PROMPT_MAX_LENGTH = 1000;
export const VIDEO_GENERATION_SOURCE_MIME_TYPES: readonly string[] = [
  "image/png", "image/jpeg", "image/jpg", "image/webp",
];

export type VideoGenerationStatus = "pending" | "processing" | "succeeded" | "failed";

export interface VideoGenerationQuote {
  credits: number;
  durationSeconds: typeof VIDEO_GENERATION_DURATION_SECONDS;
  model: typeof VIDEO_GENERATION_MODEL;
}

export interface VideoGenerationMedia {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export interface VideoGenerationJob {
  id: string;
  projectId: string;
  status: VideoGenerationStatus;
  credits: number;
  media?: VideoGenerationMedia;
  error?: string;
}

export interface VideoGenerationOrder {
  projectId: string;
  sourceMediaId: string;
  prompt: string;
  requestId: string;
  maxCredits: number;
}

export interface VideoGenerationsResponse {
  enabled: boolean;
  quote: VideoGenerationQuote;
  jobs: VideoGenerationJob[];
}

export interface VideoGenerationResponse {
  job: VideoGenerationJob;
}
