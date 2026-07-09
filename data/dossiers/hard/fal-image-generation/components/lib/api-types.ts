import { ProviderKey } from "./provider-config";

export interface GenerateImageRequest {
  prompt: string;
  provider: ProviderKey;
  modelId: string;
}

export interface GenerateImageResponse {
  image?: string;
  error?: string;
  /**
   * True when `image` is a demo placeholder returned because no real
   * FAL_API_KEY is configured (mock: canned). Surface a small "Demo-bild"
   * label in the UI so it never reads as a real generation.
   */
  demo?: boolean;
}
