export type RightPanelTab =
  | "versions"
  | "files"
  | "deployments"
  | "preview"
  | "recommendations";

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
