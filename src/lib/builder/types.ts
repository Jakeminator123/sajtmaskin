export type RightPanelTab = "versions" | "files" | "deployments" | "preview";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  isStreaming?: boolean;
};

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  locked?: boolean;
}
