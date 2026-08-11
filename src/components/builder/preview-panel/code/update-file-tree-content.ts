import type { FileNode } from "@/lib/builder/types";

export function updateFileTreeContent(
  nodes: FileNode[],
  targetPath: string,
  nextContent: string,
): FileNode[] {
  return nodes.map((node) => {
    if (node.type === "file" && node.path === targetPath) {
      return { ...node, content: nextContent };
    }
    if (node.children?.length) {
      return {
        ...node,
        children: updateFileTreeContent(node.children, targetPath, nextContent),
      };
    }
    return node;
  });
}
