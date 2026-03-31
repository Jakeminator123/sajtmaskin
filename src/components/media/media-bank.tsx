export type MediaFileType = "image" | "video" | "pdf" | "text" | "logo" | "other";

export interface MediaItem {
  id: string;
  type: MediaFileType;
  url: string;
  base64?: string;
  prompt?: string;
  filename?: string;
  mimeType?: string;
  createdAt: Date;
  source: "generated" | "uploaded";
  description?: string;
}

