export type RightPanelTab = "versions" | "files" | "deployments" | "preview" | "recommendations";

export type UiMessagePart = {
  type?: string;
  [key: string]: unknown;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  isStreaming?: boolean;
  uiParts?: UiMessagePart[];
};

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  locked?: boolean;
}

export type InspectorSelection = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  selector: string;
};

export type ElementMapItem = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  vpPercent: { x: number; y: number; w: number; h: number };
};

export type ElementMapResponse = {
  success: boolean;
  elements?: ElementMapItem[];
  viewport?: { width: number; height: number };
  elementCount?: number;
  collectedAt?: string;
  error?: string;
};
