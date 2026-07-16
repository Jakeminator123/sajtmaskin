export type FigmaParsedUrl = {
  fileKey: string;
  nodeId?: string;
};

export function parseFigmaUrl(rawUrl: string): FigmaParsedUrl | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "figma.com" && !hostname.endsWith(".figma.com")) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const fileIndex = parts.findIndex((part) => ["file", "design", "proto"].includes(part));
    if (fileIndex === -1 || !parts[fileIndex + 1]) return null;

    const fileKey = parts[fileIndex + 1];
    const nodeId = url.searchParams.get("node-id") || url.searchParams.get("node_id") || undefined;
    return {
      fileKey,
      nodeId: nodeId ? decodeURIComponent(nodeId) : undefined,
    };
  } catch {
    return null;
  }
}
