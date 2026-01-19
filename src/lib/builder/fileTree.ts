import type { FileNode } from '@/lib/builder/types';

export function buildFileTree(
  flatFiles: Array<{ name: string; content?: string; locked?: boolean }>
): FileNode[] {
  type MutableFolder = FileNode & { _childrenMap?: Map<string, MutableFolder | FileNode> };

  const root: MutableFolder = {
    name: '',
    path: '',
    type: 'folder',
    children: [],
    _childrenMap: new Map(),
  };

  for (const file of flatFiles) {
    if (!file?.name) continue;
    const parts = file.name.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = i === parts.length - 1;

      current._childrenMap ||= new Map();

      if (isLeaf) {
        const node: FileNode = {
          name: part,
          path: currentPath,
          type: 'file',
          content: file.content,
          locked: file.locked,
        };
        current._childrenMap.set(part, node);
      } else {
        const existing = current._childrenMap.get(part);
        if (existing && existing.type === 'folder') {
          current = existing as MutableFolder;
        } else {
          const folder: MutableFolder = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: [],
            _childrenMap: new Map(),
          };
          current._childrenMap.set(part, folder);
          current = folder;
        }
      }
    }
  }

  const toArray = (folder: MutableFolder): FileNode[] => {
    const items = Array.from(folder._childrenMap?.values() || []);
    const normalized: FileNode[] = items.map((node) => {
      if ((node as FileNode).type === 'folder') {
        const f = node as MutableFolder;
        const children = toArray(f);
        return { name: f.name, path: f.path, type: 'folder', children };
      }
      return node as FileNode;
    });

    normalized.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return normalized;
  };

  return toArray(root);
}
