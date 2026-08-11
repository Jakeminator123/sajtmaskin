import type { FileNode } from "@/lib/builder/types";

export function getPreferredFilePath(flatFiles: Array<{ name: string }>): string | null {
  const candidates = [
    "app/page.tsx",
    "src/app/page.tsx",
    "pages/index.tsx",
    "page.tsx",
    "Page.tsx",
  ];
  for (const candidate of candidates) {
    const match = flatFiles.find((file) => file.name.endsWith(candidate));
    if (match) return match.name;
  }
  return flatFiles[0]?.name || null;
}

export function findFirstFileInTree(nodes: FileNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.type === "file") return node;
    if (node.children?.length) {
      const hit = findFirstFileInTree(node.children);
      if (hit) return hit;
    }
  }
  return null;
}

export function findFileNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.type === "folder" && node.children?.length) {
      const hit = findFileNodeByPath(node.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

export function getLanguageFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "ts") return "typescript";
  if (ext === "tsx") return "tsx";
  if (ext === "js") return "javascript";
  if (ext === "jsx") return "jsx";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "md") return "markdown";
  if (ext === "html") return "html";
  return "text";
}
